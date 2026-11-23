-- =====================================================================
-- Içara Training Club — modalidades, grade semanal e planos
--
-- Parte 1 (estrutura): cria o que ainda não existe no schema
--   • boxes.slug                 → achar o box sem colar UUID
--   • modalities                 → CROSS, HYROX/HY-FITNESS, STRONG…
--   • schedule_slots.modality_id → cada horário da grade tem uma modalidade
--   • plans + plan_modalities    → catálogo de planos (família, frequência,
--                                  período, preço/mês) e o que cada um libera
-- Parte 2 (dados): bloco DO que acha o box pelo slug/nome e grava tudo.
--
-- Convenção de dia da semana (igual a extract(dow) do Postgres e getDay() do JS):
--   0 = domingo, 1 = segunda, 2 = terça, 3 = quarta, 4 = quinta, 5 = sexta, 6 = sábado
--
-- Pode rodar mais de uma vez: tudo é "if not exists" / upsert.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — ESTRUTURA
-- =====================================================================

-- ---------- boxes.slug ----------
alter table boxes add column if not exists slug text;
create unique index if not exists boxes_slug_key on boxes (slug) where slug is not null;

-- ---------- Modalidades ----------
create table if not exists modalities (
  id            uuid primary key default gen_random_uuid(),
  box_id        uuid not null references boxes(id) on delete cascade,
  code          text not null check (code ~ '^[A-Z0-9_]{2,30}$'),          -- chave estável usada nos scripts
  name          text not null check (length(trim(name)) between 1 and 40), -- nome exibido no app
  color         text check (color ~ '^#[0-9a-fA-F]{6}$'),                  -- cor de destaque; null = cor padrão do app
  display_order int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (box_id, code)
);

-- ---------- Modalidade de cada horário da grade ----------
alter table schedule_slots
  add column if not exists modality_id uuid references modalities(id) on delete set null;
create index if not exists schedule_slots_modality_idx on schedule_slots (modality_id);

-- ---------- Catálogo de planos ----------
-- Preço sempre por mês (como o box divulga). total_price = valor do período inteiro.
-- Ainda NÃO é usado por create_charge/book_class (que seguem com plan_kind + boxes.price_*).
create table if not exists plans (
  id            uuid primary key default gen_random_uuid(),
  box_id        uuid not null references boxes(id) on delete cascade,
  code          text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  name          text not null,
  family        text not null check (family in ('HY-FITNESS', 'TOTAL', 'AVULSO')),
  kind          text not null default 'plano' check (kind in ('plano', 'adicional', 'aula_avulsa')),
  weekly_limit  smallint check (weekly_limit > 0),          -- null = livre (sem limite semanal)
  period        text not null check (period in ('mensal', 'trimestral', 'semestral', 'anual', 'avulso')),
  months        smallint check (months in (1, 3, 6, 12)),   -- null para aula avulsa
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  total_price   numeric(10,2) generated always as (monthly_price * coalesce(months, 1)) stored,
  display_order int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (box_id, code),
  check ((period = 'avulso') = (months is null))
);

-- Quais modalidades cada plano (ou adicional) libera
create table if not exists plan_modalities (
  plan_id     uuid not null references plans(id) on delete cascade,
  modality_id uuid not null references modalities(id) on delete cascade,
  primary key (plan_id, modality_id)
);

-- ---------- Acesso ----------
-- Leitura: membros do box (aluno vê a grade e os planos). Escrita: SQL Editor / service_role.
alter table modalities      enable row level security;
alter table plans           enable row level security;
alter table plan_modalities enable row level security;

drop policy if exists modalities_read on modalities;
create policy modalities_read on modalities for select to authenticated
  using (is_member(box_id));

drop policy if exists plans_read on plans;
create policy plans_read on plans for select to authenticated
  using (is_member(box_id));

drop policy if exists plan_modalities_read on plan_modalities;
create policy plan_modalities_read on plan_modalities for select to authenticated
  using (exists (select 1 from plans p where p.id = plan_id and is_member(p.box_id)));

revoke all on modalities, plans, plan_modalities from anon, authenticated;
grant select on modalities, plans, plan_modalities to authenticated;


-- =====================================================================
-- PARTE 2 — DADOS DO IÇARA TRAINING CLUB
-- =====================================================================
do $$
declare
  v_slug     constant text := 'icara-training-club';
  v_name     constant text := 'Içara Training Club';
  v_box      uuid;
  v_slots    int;
  v_off      int;
  v_plans    int;
begin
  -- ---------- 1. Box: pelo slug, senão pelo nome (sem acento/maiúscula), senão cria ----------
  select id into v_box from boxes where slug = v_slug;

  if v_box is null then
    select id into v_box from boxes
     where lower(translate(name, 'çÇáàâãéêíóôõúÁÀÂÃÉÊÍÓÔÕÚ', 'cCaaaaeeiooouAAAAEEIOOOU')) = 'icara training club'
     order by created_at limit 1;
    if v_box is not null then
      update boxes set slug = v_slug where id = v_box;
    end if;
  end if;

  if v_box is null then
    insert into boxes (name, slug) values (v_name, v_slug) returning id into v_box;
    raise notice 'Box "%" não existia e foi criado (id %). Preencha lat/lng e cores no painel.', v_name, v_box;
  end if;

  -- ---------- 2. Modalidades ----------
  insert into modalities (box_id, code, name, color, display_order)
  values
    (v_box, 'CROSS',        'CROSS',              '#FFFFFF', 1),  -- destaque branco
    (v_box, 'HYROX',        'HYROX / HY-FITNESS', '#FCBC18', 2),  -- destaque amarelo da logo
    (v_box, 'STRONG',       'STRONG',             null,      3),
    (v_box, 'STRONG_CROSS', 'STRONG/CROSS',       null,      4),  -- turma mista
    (v_box, 'AULAO',        'AULÃO',              null,      5)   -- sábado
  on conflict (box_id, code) do update
    set name = excluded.name, color = excluded.color,
        display_order = excluded.display_order, active = true;

  -- ---------- 3. Grade semanal ----------
  -- Upsert por (box, dia, horário). Horário que já existia: troca a modalidade e reativa,
  -- mas mantém capacidade/coach/nível que o coach já ajustou.
  -- Horários do box fora desta grade são DESATIVADOS (não apagados: class_sessions apontam para eles).
  with grid (weekday, start_time, code, label) as (
    values
      -- Segunda
      (1, '06:00'::time, 'CROSS', null::text), (1, '07:00', 'CROSS', null), (1, '08:00', 'CROSS', null),
      (1, '12:10', 'CROSS', null), (1, '16:30', 'CROSS', null), (1, '17:30', 'CROSS', null),
      (1, '18:30', 'CROSS', null), (1, '19:30', 'HYROX', null),
      -- Terça
      (2, '06:00', 'CROSS', null), (2, '07:00', 'CROSS', null), (2, '08:00', 'CROSS', null),
      (2, '17:30', 'CROSS', null), (2, '18:30', 'CROSS', null), (2, '19:30', 'STRONG_CROSS', null),
      -- Quarta (dia do HYROX)
      (3, '06:00', 'HYROX', null), (3, '07:00', 'HYROX', null), (3, '08:00', 'HYROX', null),
      (3, '12:10', 'HYROX', null), (3, '16:30', 'HYROX', null), (3, '17:30', 'HYROX', null),
      (3, '18:30', 'HYROX', null), (3, '19:30', 'HYROX', null),
      -- Quinta
      (4, '06:00', 'CROSS', null), (4, '07:00', 'CROSS', null), (4, '08:00', 'CROSS', null),
      (4, '17:30', 'CROSS', null), (4, '18:30', 'CROSS', null), (4, '19:30', 'STRONG_CROSS', null),
      -- Sexta
      (5, '06:00', 'CROSS', null), (5, '07:00', 'CROSS', null), (5, '08:00', 'CROSS', null),
      (5, '12:10', 'HYROX', null), (5, '16:30', 'CROSS', null), (5, '17:30', 'CROSS', null),
      (5, '18:30', 'HYROX', null), (5, '19:30', 'CROSS', null),
      -- Sábado
      (6, '09:30', 'AULAO', 'Aulão de Sábado')
  ),
  up as (
    insert into schedule_slots (box_id, weekday, start_time, capacity, modality_id, label, active)
    -- vagas por aula para horários NOVOS, por modalidade (combinado com o box em 23/11/2026;
    -- horários já existentes mantêm a capacidade atual: veja 20261209_icara_vagas_por_modalidade.sql)
    select v_box, g.weekday, g.start_time,
           case g.code when 'CROSS' then 16 when 'HYROX' then 18 when 'STRONG' then 8
                       when 'STRONG_CROSS' then 16 when 'AULAO' then 30 else 16 end,
           m.id, g.label, true
      from grid g
      join modalities m on m.box_id = v_box and m.code = g.code
    on conflict (box_id, weekday, start_time) do update
      set modality_id = excluded.modality_id,
          label       = excluded.label,
          active      = true
    returning id
  ),
  deact as (
    update schedule_slots s set active = false
     where s.box_id = v_box and s.active
       and s.id not in (select id from up)
    returning s.id
  )
  select (select count(*) from up), (select count(*) from deact) into v_slots, v_off;

  -- ---------- 4. Planos ----------
  -- O que cada plano libera fica no passo seguinte (plan_modalities)
  with catalog (code, name, family, kind, weekly_limit, period, months, monthly_price, display_order) as (
    values
      -- HY-FITNESS — só aulas de HYROX/HY-FITNESS (+ Aulão de sábado)
      ('HYF_2X_MENSAL',     'HY-FITNESS 2x/semana · Mensal',     'HY-FITNESS', 'plano', 2::smallint, 'mensal',     1::smallint,  245.00::numeric, 101),
      ('HYF_2X_TRIMESTRAL', 'HY-FITNESS 2x/semana · Trimestral', 'HY-FITNESS', 'plano', 2, 'trimestral', 3,  235.00, 102),
      ('HYF_2X_SEMESTRAL',  'HY-FITNESS 2x/semana · Semestral',  'HY-FITNESS', 'plano', 2, 'semestral',  6,  215.00, 103),
      ('HYF_2X_ANUAL',      'HY-FITNESS 2x/semana · Anual',      'HY-FITNESS', 'plano', 2, 'anual',      12, 175.00, 104),
      ('HYF_3X_MENSAL',     'HY-FITNESS 3x/semana · Mensal',     'HY-FITNESS', 'plano', 3, 'mensal',     1,  265.00, 111),
      ('HYF_3X_TRIMESTRAL', 'HY-FITNESS 3x/semana · Trimestral', 'HY-FITNESS', 'plano', 3, 'trimestral', 3,  255.00, 112),
      ('HYF_3X_SEMESTRAL',  'HY-FITNESS 3x/semana · Semestral',  'HY-FITNESS', 'plano', 3, 'semestral',  6,  235.00, 113),
      ('HYF_3X_ANUAL',      'HY-FITNESS 3x/semana · Anual',      'HY-FITNESS', 'plano', 3, 'anual',      12, 195.00, 114),
      -- Adicional do HY-FITNESS: + R$ 40/mês libera STRONG
      ('HYF_ADD_STRONG',    'Adicional STRONG (HY-FITNESS)',     'HY-FITNESS', 'adicional', null, 'mensal', 1, 40.00, 190),

      -- TOTAL — todas as modalidades
      ('TOT_2X_MENSAL',        'TOTAL 2x/semana · Mensal',     'TOTAL', 'plano', 2, 'mensal',     1,  245.00, 201),
      ('TOT_2X_TRIMESTRAL',    'TOTAL 2x/semana · Trimestral', 'TOTAL', 'plano', 2, 'trimestral', 3,  225.00, 202),
      ('TOT_2X_SEMESTRAL',     'TOTAL 2x/semana · Semestral',  'TOTAL', 'plano', 2, 'semestral',  6,  200.00, 203),
      ('TOT_2X_ANUAL',         'TOTAL 2x/semana · Anual',      'TOTAL', 'plano', 2, 'anual',      12, 185.00, 204),
      ('TOT_3X_MENSAL',        'TOTAL 3x/semana · Mensal',     'TOTAL', 'plano', 3, 'mensal',     1,  260.00, 211),
      ('TOT_3X_TRIMESTRAL',    'TOTAL 3x/semana · Trimestral', 'TOTAL', 'plano', 3, 'trimestral', 3,  240.00, 212),
      ('TOT_3X_SEMESTRAL',     'TOTAL 3x/semana · Semestral',  'TOTAL', 'plano', 3, 'semestral',  6,  220.00, 213),
      ('TOT_3X_ANUAL',         'TOTAL 3x/semana · Anual',      'TOTAL', 'plano', 3, 'anual',      12, 195.00, 214),
      ('TOT_LIVRE_MENSAL',     'TOTAL Livre · Mensal',         'TOTAL', 'plano', null, 'mensal',     1,  275.00, 221),
      ('TOT_LIVRE_TRIMESTRAL', 'TOTAL Livre · Trimestral',     'TOTAL', 'plano', null, 'trimestral', 3,  255.00, 222),
      ('TOT_LIVRE_SEMESTRAL',  'TOTAL Livre · Semestral',      'TOTAL', 'plano', null, 'semestral',  6,  235.00, 223),
      ('TOT_LIVRE_ANUAL',      'TOTAL Livre · Anual',          'TOTAL', 'plano', null, 'anual',      12, 215.00, 224),

      -- Avulsos / sem fidelidade
      ('AV_1X_SEM_FIDELIDADE', '1x/semana · Sem fidelidade',   'AVULSO', 'plano',       1, 'mensal', 1,  125.00, 301),
      ('AV_DROPIN',            'Aula avulsa (drop-in)',        'AVULSO', 'aula_avulsa', null, 'avulso', null, 40.00, 302)
  ),
  up as (
    insert into plans (box_id, code, name, family, kind, weekly_limit, period, months, monthly_price, display_order, active)
    select v_box, c.code, c.name, c.family, c.kind, c.weekly_limit, c.period, c.months, c.monthly_price, c.display_order, true
      from catalog c
    on conflict (box_id, code) do update
      set name = excluded.name, family = excluded.family, kind = excluded.kind,
          weekly_limit = excluded.weekly_limit, period = excluded.period, months = excluded.months,
          monthly_price = excluded.monthly_price, display_order = excluded.display_order, active = true
    returning id, code
  )
  select count(*) into v_plans from up;

  -- Acesso por modalidade: refaz do zero para os planos do box (mantém em sincronia com o catálogo acima)
  delete from plan_modalities pm using plans p where p.id = pm.plan_id and p.box_id = v_box;

  insert into plan_modalities (plan_id, modality_id)
  select p.id, m.id
    from plans p
    join lateral unnest(case
           when p.family = 'HY-FITNESS' and p.kind = 'plano'     then array['HYROX','AULAO']
           when p.family = 'HY-FITNESS' and p.kind = 'adicional' then array['STRONG']
           else array['CROSS','HYROX','STRONG','STRONG_CROSS','AULAO']
         end) as a(code) on true
    join modalities m on m.box_id = v_box and m.code = a.code
   where p.box_id = v_box and p.active;

  -- ---------- 5. Preços que o app já usa hoje ----------
  -- create_charge ainda cobra por plan_kind ('2x','3x','ilimitado') lendo boxes.price_*.
  -- Até o catálogo de planos entrar no fluxo de cobrança, usa o TOTAL mensal + drop-in.
  update boxes
     set price_2x        = 245.00,
         price_3x        = 260.00,
         price_ilimitado = 275.00,
         price_dropin    = 40.00,
         -- Azul + amarelo da logo (mesmas cores de src/lib/boxPresets.js). Só preenche se ainda estiver vazio.
         brand_primary   = coalesce(brand_primary,   '#243464'),
         brand_secondary = coalesce(brand_secondary, '#FCBC18')
   where id = v_box;

  raise notice 'Içara Training Club (%): % horários gravados, % desativados, % planos.', v_box, v_slots, v_off, v_plans;
end $$;


-- =====================================================================
-- Conferência (opcional): rode depois para ver a grade e os planos
-- =====================================================================
-- select to_char(make_date(2026, 11, 15 + s.weekday), 'TMDy') as dia, s.start_time, m.name as modalidade, s.capacity, s.active
--   from schedule_slots s join boxes b on b.id = s.box_id left join modalities m on m.id = s.modality_id
--  where b.slug = 'icara-training-club' order by s.weekday, s.start_time;
--
-- select p.family, p.name, p.monthly_price, p.total_price, string_agg(m.code, ', ' order by m.display_order) as libera
--   from plans p join boxes b on b.id = p.box_id
--   left join plan_modalities pm on pm.plan_id = p.id left join modalities m on m.id = pm.modality_id
--  where b.slug = 'icara-training-club' group by p.id order by p.display_order;
