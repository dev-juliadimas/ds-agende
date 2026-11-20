-- =====================================================================
-- DS Agende • Box de CrossFit — schema Supabase (PostgreSQL)
-- Fonte única de verdade para a Web (React) e o Bot de WhatsApp.
-- Todas as regras de negócio ficam em funções SQL (RPC) para que os
-- dois canais apliquem exatamente as mesmas validações.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_cron;   -- jobs de carência/bloqueio e expiração de pré-reservas

-- ---------- Configuração do box (multi-tenant) ----------
create table boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision, lng double precision,
  gps_checkin_enabled boolean not null default true,                     -- Painel Coach → Capacidade: liga/desliga check-in por GPS
  gps_radius_m int not null default 50 check (gps_radius_m in (30, 50, 100)), -- raio de tolerância do check-in
  checkin_window_min int not null default 15,
  timezone text not null default 'America/Sao_Paulo',    -- "dia" da agenda e do aniversário no fuso do box
  -- Identidade visual do cliente (white-label). Logos no Storage: assets/boxes/<id>/logo-*.png
  brand_primary   text check (brand_primary   ~ '^#[0-9a-fA-F]{6}$'), -- ex.: azul marinho
  brand_secondary text check (brand_secondary ~ '^#[0-9a-fA-F]{6}$'), -- ex.: dourado
  -- Regras definidas pelo responsável (Painel Coach → Capacidade)
  min_cancel_minutes int not null default 120 check (min_cancel_minutes between 0 and 2880), -- cancelar/trocar até X min antes sem consumir o crédito (0 = até o início); depois disso vira 'late_cancel'
  book_ahead_days int not null default 7 check (book_ahead_days between 0 and 60),            -- reservar com até X dias de antecedência (0 = só no dia)
  reminder_time time not null default '20:00',
  -- Regra Anti-Falta (Painel → Capacidade). O prazo para cancelar sem falta é min_cancel_minutes.
  noshow_rule_enabled boolean not null default false,
  noshow_tolerance int not null default 2 check (noshow_tolerance between 1 and 10),        -- faltas sem aviso no mês até punir
  noshow_penalty text not null default 'block48' check (noshow_penalty in ('block48','loseRecurring','deductWeekly')),
  dispatch_penalty boolean not null default true,
  -- Financeiro (Painel → Financeiro)
  grace_days int not null default 3 check (grace_days between 0 and 15),   -- carência após o vencimento
  price_2x numeric(10,2) not null default 189,
  price_3x numeric(10,2) not null default 229,
  price_ilimitado numeric(10,2) not null default 269,
  price_dropin numeric(10,2) not null default 50,
  price_extra numeric(10,2) not null default 35,
  hold_minutes int not null default 15,                                     -- pré-reserva aguardando Pix/Cartão
  -- Disparos ativos do bot (custo Meta). Atendimento receptivo é sempre ligado.
  dispatch_reminder boolean not null default true,
  dispatch_waitlist boolean not null default true,
  dispatch_billing  boolean not null default true,
  dispatch_urgent   boolean not null default true,  -- legado: avisos agora vão pela Comunidade (20261128)
  dispatch_badge    boolean not null default true,
  dispatch_rescue   boolean not null default false,
  whatsapp_community_url text check (whatsapp_community_url is null or whatsapp_community_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$'), -- convite da Comunidade do WhatsApp do box (avisos, custo zero)
  sales_mode text not null default 'auto' check (sales_mode in ('livre','auto')), -- venda avulsa só em horários vazios
  sales_max_pct int not null default 70,                                          -- acima disso a aula fica bloqueada p/ venda
  -- Contato público (página /clientes/:slug). Lido sem login via get_box_contact → migrations/20261202_box_contato.sql
  address       text,                                                                                   -- endereço completo (vira link do Google Maps)
  instagram_url text check (instagram_url is null or instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9_.]+/?$'),
  whatsapp      text check (whatsapp is null or whatsapp ~ '^55[0-9]{10,11}$'),                         -- 55 + DDD + número, só dígitos
  created_at timestamptz default now()
);

create type member_role as enum ('owner','coach','aluno','visitante','dropin');
create type plan_kind   as enum ('2x','3x','ilimitado');

create table people (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id),  -- null para visitantes vindos do WhatsApp
  name text not null,
  phone text not null,                                  -- E.164, chave de identificação no bot
  role member_role not null default 'aluno',
  plan plan_kind,
  due_date date,                                        -- próximo vencimento da mensalidade
  blocked_at timestamptz,                               -- preenchido pelo job enforce_billing()
  -- 'aguardando_pagamento' = recém-cadastrado sem a 1ª baixa: não reserva (plan_status = 'pendente')
  financial_status text not null default 'ativo'
    constraint people_financial_status_chk check (financial_status in ('ativo','aguardando_pagamento','experimental')),
  referral_code text unique,                            -- código do Indique e Ganhe (?ref=CODIGO), gerado por my_referral
  referred_by uuid references people(id) on delete set null, -- quem indicou (Indique e Ganhe / selo Treino em Dupla)
  companion_of uuid references people(id),
  converted_at timestamptz,                             -- visitante → aluno
  birth_date date,                                      -- aniversariantes; o ano nunca é exibido a outros alunos
  birthday_public boolean not null default false,       -- consentimento (LGPD): aparecer na lista do mês para os colegas
  can_publish_notices_directly boolean not null default false, -- coach publica no mural sem aprovação do admin (20261127)
  active boolean not null default true,                 -- false = coach desativado: sem acesso de equipe, fora das aulas e trocas (20261208)
  deactivated_at timestamptz,
  created_at timestamptz default now(),
  unique (box_id, phone, name)
);

-- PAR-Q rápido (visitantes e drop-ins) — dado sensível de saúde (LGPD art. 11)
-- PAR-Q completo, versão do termo e RLS (aluno insere, só a equipe lê): migrations/20261122_auto_cadastro.sql
create table health_forms (
  person_id uuid primary key references people(id) on delete cascade,
  injuries text,
  experience text,
  consent_at timestamptz not null default now()
);

-- Indique e Ganhe: recompensa do indicador. 'pending' no cadastro com ?ref=, 'earned' na
-- 1ª mensalidade paga do indicado, 'used' quando o box aplica. Regras: migrations/20261130_indique_ganhe.sql
create table referral_rewards (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  referrer_id uuid not null references people(id) on delete cascade,
  referred_id uuid not null unique references people(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','earned','used')),
  created_at timestamptz not null default now(),
  earned_at timestamptz,
  used_at timestamptz,
  check (referrer_id <> referred_id)
);

-- ---------- Grade fixa + exceções por data ----------
create type class_level as enum ('misto','iniciante','scaled','rx');

create table schedule_slots (               -- grade semanal fixa
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  duration_min int not null default 60,
  level class_level not null default 'misto',
  coach_id uuid references people(id),
  capacity int not null check (capacity > 0),
  trial_quota int not null default 5,                     -- máx. de alunos em aula experimental por turma
  label text,                               -- ex.: 'Aulão de Sábado'
  sales_block text not null default 'auto' check (sales_block in ('auto','open','blocked')), -- exceção manual de venda
  active boolean not null default true,
  unique (box_id, weekday, start_time)
);

create table class_sessions (              -- instância concreta (data + horário)
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references schedule_slots(id),
  box_id uuid not null references boxes(id),
  starts_at timestamptz not null,
  capacity_override int,                   -- ajuste excepcional só desta data
  coach_override uuid references people(id),
  cancelled boolean not null default false,
  closed_at timestamptz,                   -- encerramento → classificação de presença
  unique (slot_id, starts_at)
);

-- Treino do Dia por data e modalidade (regras: migrations/20261201_treino_do_dia.sql).
-- modality = modalities.code (CROSS, HYROX…), o mesmo modality_code de get_agenda.
-- Substitui a antiga tabela de protótipo `wods` (um treino por dia, sem modalidade).
create table daily_wods (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid not null references boxes(id) on delete cascade,
  wod_date    date not null,
  modality    text not null,
  title       text not null check (length(trim(title)) between 1 and 80),
  description text check (length(description) <= 4000),
  created_by  uuid references people(id) on delete set null,   -- trigger daily_wods_before_write
  updated_at  timestamptz not null default now(),
  unique (box_id, wod_date, modality),
  foreign key (box_id, modality) references modalities(box_id, code) on update cascade on delete cascade
);
create index daily_wods_box_date on daily_wods (box_id, wod_date);

-- ---------- Reservas, recorrência e lista de espera ----------
create type booking_type   as enum ('avulso','recorrente','experimental','dropin','extra');
create type booking_status as enum ('reservado','presente','cancelado','falta','abonada','pre_reserva','expirado','late_cancel'); -- abonada = falta justificada, abonada pelo coach; late_cancel = cancelou dentro de min_cancel_minutes: libera a vaga mas conta no limite semanal
create type channel        as enum ('web','whatsapp','coach','sistema');
create type checkin_method as enum ('qr','gps','manual');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  person_id uuid not null references people(id),
  type booking_type not null default 'avulso',
  status booking_status not null default 'reservado',
  source channel not null,
  confirmed_at timestamptz,               -- confirmou no lembrete anti-falta
  cancelled_at timestamptz,
  cancelled_in_time boolean,
  checkin_method checkin_method,
  checkin_at timestamptz,
  wod_result text,                        -- tempo/carga registrado pelo aluno
  hold_until timestamptz,                 -- pre_reserva: expira se o pagamento não chegar
  pay_pending boolean not null default false, -- aula avulsa a pagar na recepção
  cancel_reason text,                     -- ex.: 'inadimplencia'
  created_at timestamptz default now()
);
-- impede reserva duplicada ativa na mesma aula
create unique index bookings_one_active on bookings(session_id, person_id) where status in ('reservado','presente');
create index on bookings(person_id, status);

create table recurrences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  weekdays smallint[] not null,
  start_time time not null,
  active boolean not null default true,
  created_via channel not null
);

-- Horário Fixo: o aluno fixa uma turma da grade e a vaga é reservada toda semana
-- (só com plano ativo). RPCs, RLS e job: migrations/20261130_horario_fixo.sql
create table recurring_bookings (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  schedule_slot_id uuid not null references schedule_slots(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, schedule_slot_id)
);

create table waitlist (
  session_id uuid references class_sessions(id) on delete cascade,
  person_id uuid references people(id),
  position serial,
  created_at timestamptz default now(),
  primary key (session_id, person_id)
);

-- ---------- QR dinâmico ----------
create table checkin_tokens (
  session_id uuid references class_sessions(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  primary key (session_id, token)
);

-- ---------- Gamificação ----------
create table badges (id text primary key, name text, description text, emoji text, metric text, goal int);
create table person_badges (
  person_id uuid references people(id) on delete cascade,
  badge_id text references badges(id),
  unlocked_at timestamptz default now(),
  primary key (person_id, badge_id)
);

-- ---------- Comunicação ----------
create table notices (                 -- Mural do Box (regras: migrations/20261125_mural_avisos.sql e 20261127_avisos_moderacao.sql)
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text check (body is null or char_length(body) <= 2000),
  category text not null default 'geral'
    check (category in ('geral','urgente','evento','horario','feriado','aulao','desafio')), -- as 3 últimas: avisos antigos
  pinned boolean not null default false,   -- comunicado oficial fixado no topo do mural
  send_whatsapp boolean not null default false, -- legado: alerta pago desativado em 20261128 (avisos vão pela Comunidade)
  event_date date,                   -- quando acontece (aparece em destaque no card)
  highlight text,                    -- tag curta de destaque ("Horário especial", "20 vagas")
  created_by uuid references people(id) on delete set null, -- preenchido pelo trigger com quem está logado
  author_name text,                  -- o aluno não lê `people`; o nome fica no aviso
  affected_day date,
  whatsapp_sent_at timestamptz,      -- legado (histórico dos avisos antigos)
  whatsapp_recipients int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- moderação: aviso de coach sem publicação direta espera o administrador
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  reviewed_by uuid references people(id) on delete set null,  -- admin que aprovou/recusou
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  published_at timestamptz           -- entrou no mural (ordem do feed)
);
create index notices_feed_idx on notices (box_id, status, pinned desc, published_at desc);
create index notices_author_idx on notices (created_by);

-- ---------- Stories do coach (foto + legenda, somem em 24 h) ----------
-- A foto fica no Storage, bucket privado 'stories', no caminho '<box_id>/<uuid>.jpg'.
create table stories (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  author_id uuid not null references people(id),
  image_path text not null,                              -- caminho no bucket 'stories'
  caption text check (char_length(caption) <= 140),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index on stories(box_id, expires_at desc);

create table story_views (                               -- anel âmbar = ainda não visto
  story_id uuid references stories(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, person_id)
);

create table whatsapp_outbox (           -- fila consumida pela Edge Function que chama a Evolution/Cloud API
  id bigserial primary key,
  box_id uuid references boxes(id),
  person_id uuid references people(id),
  kind text not null,                    -- reminder | badge | waitlist | rescue | billing (avisos do mural não entram: Comunidade do WhatsApp) (só se o disparo estiver ligado no box)
  meta_category text,                    -- utilidade | marketing (custo Meta); null = resposta dentro da janela de 24h (grátis)
  payload jsonb not null,
  send_after timestamptz default now(),
  sent_at timestamptz,
  error text
);

create table bot_sessions (              -- estado da conversa do bot por telefone
  box_id uuid references boxes(id),
  phone text,
  step text, data jsonb default '{}',
  updated_at timestamptz default now(),
  primary key (box_id, phone)
);

-- =====================================================================
-- RPCs (regras de negócio compartilhadas Web + Bot)
-- =====================================================================

-- Reserva com bloqueio de vaga em tempo real (FOR UPDATE evita overbooking
-- quando app e WhatsApp disputam a última vaga no mesmo segundo).
create or replace function book_class(p_session uuid, p_person uuid, p_type booking_type, p_source channel, p_hold boolean default false)
returns bookings language plpgsql security definer as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; cap int; taken int; trials int; p people; weekly int; result bookings;
begin
  select * into s from class_sessions where id = p_session for update;
  select * into sl from schedule_slots where id = s.slot_id;
  select * into bx from boxes where id = s.box_id;
  if s.cancelled or s.closed_at is not null or s.starts_at < now() - interval '15 minutes' then
    raise exception 'AULA_ENCERRADA';
  end if;
  -- janela de reserva (a reserva fixa é gerada pelo sistema e não depende dela)
  if p_type <> 'recorrente'
     and (s.starts_at at time zone bx.timezone)::date - (now() at time zone bx.timezone)::date > bx.book_ahead_days then
    raise exception 'AGENDA_FECHADA';
  end if;
  -- só reserva com plano ativo ou na carência (antes de olhar vagas). Exceção: experimental / drop-in.
  -- Vale para o app e para o bot (os dois chamam esta função). Ver migrations/20261129_trava_plano_ativo.sql
  select * into p from people where id = p_person;
  perform _assert_plan_active(p, p_type);
  cap := coalesce(s.capacity_override, sl.capacity);
  select count(*), count(*) filter (where type = 'experimental') into taken, trials
    from bookings where session_id = p_session and status in ('reservado','presente','pre_reserva');
  -- venda avulsa (experimental / drop-in / treino extra) só em horários liberados para venda
  if p_type in ('experimental','dropin','extra') then
    if sl.sales_block = 'blocked' then raise exception 'VENDA_BLOQUEADA'; end if;
    if sl.sales_block = 'auto' and exists (select 1 from boxes b where b.id = s.box_id and b.sales_mode = 'auto'
         and taken * 100 >= b.sales_max_pct * cap) then
      raise exception 'VENDA_BLOQUEADA';
    end if;
  end if;
  if p_type = 'experimental' then
    if sl.level not in ('iniciante','misto') then raise exception 'NIVEL_INCOMPATIVEL'; end if;
    if trials >= sl.trial_quota then raise exception 'COTA_EXPERIMENTAL'; end if;
  end if;
  -- limite semanal do plano: semana de segunda a domingo NO FUSO DO BOX (não em UTC).
  -- Vem antes da lotação: o aluno sem aula sobrando não deve ser mandado para a fila.
  -- A versão com o catálogo de planos (plans.weekly_limit + modalidades liberadas em
  -- plan_modalities → erro MODALIDADE_NAO_INCLUSA) está em migrations/20261130_regras_plano.sql.
  if p.role = 'aluno' and p.plan <> 'ilimitado' and p_type not in ('experimental','dropin','extra') then
    select count(*) into weekly from bookings b join class_sessions cs on cs.id = b.session_id
      where b.person_id = p_person and b.status in ('reservado','presente','pre_reserva','late_cancel') and b.type <> 'extra'
        and date_trunc('week', cs.starts_at at time zone bx.timezone) = date_trunc('week', s.starts_at at time zone bx.timezone);
    if weekly >= (case p.plan when '2x' then 2 else 3 end) then
      raise exception 'LIMITE_PLANO: Você já tem % de % aulas reservadas nesta semana (segunda a domingo).',
        weekly, case p.plan when '2x' then 2 else 3 end;
    end if;
  end if;
  if taken >= cap then raise exception 'TURMA_LOTADA'; end if;
  insert into bookings(session_id, person_id, type, source, status, hold_until)
    values (p_session, p_person, p_type, p_source,
            case when p_hold then 'pre_reserva'::booking_status else 'reservado' end,
            case when p_hold then now() + make_interval(mins => bx.hold_minutes) end)
    returning * into result;
  delete from waitlist where session_id = p_session and person_id = p_person;
  return result;
end $$;

-- Cancelamento + promoção da lista de espera.
-- Dentro de min_cancel_minutes vira 'late_cancel' (libera a vaga, mas conta no limite semanal).
-- p_force (coach / inadimplência) é sempre 'cancelado'. Depois do início não cancela (vira falta).
create or replace function cancel_booking(p_booking uuid, p_source channel, p_force boolean default false)
returns void language plpgsql security definer as $$
declare b bookings; s class_sessions; bx boxes; v_late boolean;
begin
  select * into b from bookings where id = p_booking for update;
  select * into s from class_sessions where id = b.session_id;
  select * into bx from boxes where id = s.box_id;
  if not p_force and s.starts_at <= now() then raise exception 'AULA_ENCERRADA'; end if;
  v_late := not p_force and s.starts_at - now() < make_interval(mins => bx.min_cancel_minutes);
  update bookings
     set status = case when v_late then 'late_cancel'::booking_status else 'cancelado'::booking_status end,
         cancelled_at = now(), cancelled_in_time = not v_late
   where id = p_booking;
  perform promote_waitlist(b.session_id);
end $$;

-- Vaga liberada → 1º da fila entra sozinho (quem não pode mais, ex.: bloqueado, é pulado)
create or replace function promote_waitlist(p_session uuid)
returns void language plpgsql security definer as $$
declare w record; s class_sessions;
begin
  select * into s from class_sessions where id = p_session;
  for w in select person_id from waitlist where session_id = p_session order by position loop
    begin
      perform book_class(p_session, w.person_id, 'avulso', 'sistema');
      insert into whatsapp_outbox(box_id, person_id, kind, payload, meta_category)
        select s.box_id, w.person_id, 'waitlist', jsonb_build_object('session_id', p_session), 'utilidade'
        from boxes where id = s.box_id and dispatch_waitlist;
      return;
    exception when others then
      delete from waitlist where session_id = p_session and person_id = w.person_id;
    end;
  end loop;
end $$;

-- Reserva fixa: cria as reservas das próximas sessões (job semanal + ao desbloquear o aluno)
create or replace function materialize_recurrence(p_rec uuid)
returns int language plpgsql security definer as $$
declare r recurrences; cs record; n int := 0;
begin
  select * into r from recurrences where id = p_rec and active;
  if not found or billing_status(r.person_id) = 'bloqueado' then return 0; end if;
  for cs in select c.id from class_sessions c join schedule_slots sl on sl.id = c.slot_id
            where sl.weekday = any(r.weekdays) and sl.start_time = r.start_time
              and c.starts_at > now() and c.starts_at < now() + interval '7 days' and not c.cancelled
              and not exists (select 1 from bookings b where b.session_id = c.id and b.person_id = r.person_id
                              and b.status in ('reservado','presente','pre_reserva')) loop
    begin
      perform book_class(cs.id, r.person_id, 'recorrente', 'sistema');
      n := n + 1;
    exception when others then null;  -- lotada / limite do plano: segue para a próxima
    end;
  end loop;
  return n;
end $$;

-- Check-in por QR dinâmico
create or replace function checkin_qr(p_session uuid, p_token text, p_person uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from checkin_tokens where session_id = p_session and token = p_token and expires_at > now()) then
    raise exception 'QR_INVALIDO_OU_EXPIRADO';
  end if;
  update bookings set status = 'presente', checkin_method = 'qr', checkin_at = now()
   where session_id = p_session and person_id = p_person and status = 'reservado';
  if not found then raise exception 'SEM_RESERVA'; end if;
end $$;

-- Encerramento: cruza reservas x check-ins → Presente / Cancelado no prazo / Falta sem aviso
create or replace function close_session(p_session uuid)
returns void language sql security definer as $$
  update bookings set status = 'falta' where session_id = p_session and status = 'reservado';
  update class_sessions set closed_at = now() where id = p_session;
$$;

-- Selos: trigger dispara ao confirmar presença
create or replace function award_badges() returns trigger language plpgsql as $$
declare total int; early int; week int;
begin
  if new.status <> 'presente' or old.status = 'presente' then return new; end if;
  select count(*) into total from bookings where person_id = new.person_id and status = 'presente';
  select count(*) into early from bookings b join class_sessions s on s.id = b.session_id
    where b.person_id = new.person_id and b.status = 'presente' and s.starts_at::time = '06:00';
  select count(*) into week from bookings b join class_sessions s on s.id = b.session_id
    where b.person_id = new.person_id and b.status = 'presente' and date_trunc('week', s.starts_at) = date_trunc('week', now());
  insert into person_badges(person_id, badge_id)
    select new.person_id, id from badges
     where (metric = 'total' and total >= goal) or (metric = 'early' and early >= goal) or (metric = 'week' and week >= goal)
  on conflict do nothing;
  return new;
end $$;
create trigger trg_award after update of status on bookings for each row execute function award_badges();

-- ---------- Aniversariantes ----------
-- Compara só mês/dia. Quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos.
create or replace function is_birthday(p_birth date, p_day date) returns boolean language sql immutable as $$
  select p_birth is not null and (
    to_char(p_birth, 'MM-DD') = to_char(p_day, 'MM-DD')
    or (to_char(p_birth, 'MM-DD') = '02-29' and to_char(p_day, 'MM-DD') = '02-28'
        and extract(day from (date_trunc('year', p_day) + interval '1 month 28 days')) <> 29)
  )
$$;

-- Quem é o usuário logado neste box / se é da equipe
create or replace function my_person(p_box uuid) returns people language sql stable security definer set search_path = public as $$
  select * from people where box_id = p_box and auth_user_id = auth.uid() limit 1
$$;
create or replace function is_member(p_box uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where box_id = p_box and auth_user_id = auth.uid())
$$;
create or replace function is_staff(p_box uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where box_id = p_box and auth_user_id = auth.uid() and role in ('owner','coach'))
$$;

-- Lista do mês para alunos e coaches: só quem consentiu, só dia (sem ano, sem telefone)
create or replace function month_birthdays(p_box uuid)
returns table (person_id uuid, name text, day int, is_today boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, extract(day from p.birth_date)::int,
         is_birthday(p.birth_date, (now() at time zone b.timezone)::date)
  from people p join boxes b on b.id = p.box_id
  where p.box_id = p_box and is_member(p_box)
    and p.role = 'aluno' and p.birthday_public
    and extract(month from p.birth_date) = extract(month from now() at time zone b.timezone)
  order by 3, 2
$$;

-- "Aniversariante do dia" na chamada: faz aniversário na data da aula e está com reserva confirmada.
-- Só a equipe vê; vale mesmo para quem não deixou a data pública (o coach precisa saber para parabenizar).
create or replace function session_birthdays(p_session uuid)
returns table (person_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name
  from class_sessions s
  join boxes bx on bx.id = s.box_id
  join bookings bk on bk.session_id = s.id and bk.status in ('reservado','presente')
  join people p on p.id = bk.person_id
  where s.id = p_session and is_staff(s.box_id)
    and is_birthday(p.birth_date, (s.starts_at at time zone bx.timezone)::date)
$$;

-- ---------- Views do dashboard ----------
create or replace view v_attendance as
select s.box_id, s.starts_at::date as day, extract(isodow from s.starts_at) as weekday,
       to_char(s.starts_at, 'HH24:MI') as hour, coalesce(s.coach_override, sl.coach_id) as coach_id,
       count(*) filter (where b.status in ('reservado','presente','falta','cancelado')) as booked,
       count(*) filter (where b.status = 'presente') as present,
       count(*) filter (where b.status = 'cancelado') as cancelled_in_time,
       count(*) filter (where b.status = 'falta') as no_show
from class_sessions s join schedule_slots sl on sl.id = s.slot_id
left join bookings b on b.session_id = s.id
where s.closed_at is not null
group by 1,2,3,4,5;

create or replace view v_churn_risk as
select p.id, p.name, p.phone, p.plan,
       now()::date - max(cs.starts_at)::date as days_inactive
from people p
left join bookings b on b.person_id = p.id and b.status = 'presente'
left join class_sessions cs on cs.id = b.session_id
where p.role = 'aluno'
group by p.id
having coalesce(now()::date - max(cs.starts_at)::date, 999) > 7;

-- Views só para SQL Editor / service_role (expõem nome e telefone): fora da API pública
alter view v_attendance set (security_invoker = on);
alter view v_churn_risk set (security_invoker = on);
revoke all on v_attendance, v_churn_risk from anon, authenticated;

-- =====================================================================
-- Financeiro: mensalidade, carência, bloqueio e pagamentos
-- Gateway genérico: a Edge Function `create_charge` fala com o provedor
-- escolhido (Pix + Cartão) e o webhook do provedor chama confirm_payment().
-- =====================================================================
create type pay_kind   as enum ('mensalidade','dropin','extra');
create type pay_method as enum ('pix','cartao','recepcao','dinheiro','maquininha');
create type pay_status as enum ('pendente','pago','expirado','cancelado');

create table payments (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  person_id uuid not null references people(id),
  kind pay_kind not null,
  plan plan_kind,                         -- mensalidade (permite troca de plano no pagamento)
  amount numeric(10,2) not null,
  method pay_method not null,             -- 'recepcao' vira 'dinheiro'/'maquininha' na baixa manual
  status pay_status not null default 'pendente',
  booking_id uuid references bookings(id),-- aula avulsa (drop-in / treino extra)
  gateway_ref text,                       -- id da cobrança no provedor (idempotência do webhook)
  confirmed_by uuid references people(id),-- gestor que deu baixa manual
  created_at timestamptz default now(),
  paid_at timestamptz
);
create unique index payments_gateway_ref on payments (gateway_ref) where gateway_ref is not null;

-- Situação da mensalidade: 'pago' | 'carencia' | 'bloqueado' (Painel e enforce_billing usam estes valores)
create or replace function billing_status(p_person uuid) returns text language sql stable as $$
  select case
    when p.due_date is null or p.role <> 'aluno' then 'pago'
    when (now() at time zone b.timezone)::date <= p.due_date then 'pago'
    when (now() at time zone b.timezone)::date - p.due_date <= b.grace_days then 'carencia'
    else 'bloqueado' end
  from people p join boxes b on b.id = p.box_id where p.id = p_person;
$$;

-- Situação do plano para reservar: 'ativo' | 'carencia' | 'pendente' | 'bloqueado' | 'sem_plano'
-- Só 'ativo' e 'carencia' reservam. Coach/owner: 'ativo'. Visitante/drop-in: 'sem_plano'
-- (reservam pelos tipos experimental/dropin). A versão com o catálogo de planos (people.plan_id)
-- está em migrations/20261129_trava_plano_ativo.sql.
create or replace function plan_status(p_person uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when p.role in ('owner','coach') then 'ativo'
    when p.role <> 'aluno' then 'sem_plano'
    when p.blocked_at is not null then 'bloqueado'
    when p.financial_status = 'aguardando_pagamento' then
      case when billing_status(p.id) = 'bloqueado' then 'bloqueado' else 'pendente' end
    when p.plan is null then 'sem_plano'
    when billing_status(p.id) = 'pago' then 'ativo'
    else billing_status(p.id) end
  from people p where p.id = p_person;
$$;

-- Trava das reservas: raise 'PLANO_INATIVO: <mensagem para o aluno>' (o app e o bot mostram o texto após o ':')
create or replace function _assert_plan_active(p people, p_type booking_type) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_status text;
begin
  if p.id is null then raise exception 'SEM_PERMISSAO'; end if;
  if p.role <> 'aluno' or p_type in ('experimental','dropin') then return; end if;
  v_status := plan_status(p.id);
  if v_status in ('ativo','carencia') then return; end if;
  raise exception 'PLANO_INATIVO: %', case v_status
    when 'pendente'  then 'Seu plano ainda está aguardando o pagamento. Regularize para liberar seus agendamentos.'
    when 'bloqueado' then 'Seu plano está suspenso por mensalidade em atraso. Regularize para voltar a agendar.'
    else 'Você precisa de um plano ativo para agendar aulas.' end
    using detail = v_status;
end $$;

-- Gera a cobrança. Pix/Cartão de aula avulsa pré-reserva a vaga (hold_minutes).
create or replace function create_charge(p_person uuid, p_kind pay_kind, p_method pay_method,
                                         p_plan plan_kind default null, p_session uuid default null, p_source channel default 'web')
returns payments language plpgsql security definer as $$
declare p people; bx boxes; bk bookings; v numeric; result payments;
begin
  select * into p from people where id = p_person;
  select * into bx from boxes where id = p.box_id;
  v := case p_kind
         when 'mensalidade' then case coalesce(p_plan, p.plan) when '2x' then bx.price_2x when '3x' then bx.price_3x else bx.price_ilimitado end
         when 'dropin' then bx.price_dropin
         else bx.price_extra end;
  if p_session is not null then
    bk := book_class(p_session, p_person, p_kind::text::booking_type, p_source, p_method in ('pix','cartao'));
    if p_method = 'recepcao' then update bookings set pay_pending = true where id = bk.id; end if;
  end if;
  if p_kind = 'mensalidade' then   -- só uma mensalidade pendente por aluno
    update payments set status = 'cancelado' where person_id = p_person and kind = 'mensalidade' and status = 'pendente';
  end if;
  insert into payments(box_id, person_id, kind, plan, amount, method, booking_id)
    values (p.box_id, p_person, p_kind, case when p_kind = 'mensalidade' then coalesce(p_plan, p.plan) end, v, p_method, bk.id)
    returning * into result;
  return result;
end $$;

-- Webhook do gateway (Pix/Cartão) ou baixa manual do gestor (Dinheiro/Maquininha)
create or replace function confirm_payment(p_payment uuid, p_method pay_method default null, p_by uuid default null)
returns payments language plpgsql security definer as $$
declare pay payments; p people; was_blocked boolean; nxt date; rec recurrences; result payments;
begin
  select * into pay from payments where id = p_payment for update;
  if pay.status <> 'pendente' then raise exception 'COBRANCA_NAO_PENDENTE'; end if;
  if pay.booking_id is not null and exists (select 1 from bookings where id = pay.booking_id and status = 'expirado') then
    raise exception 'PRE_RESERVA_EXPIRADA';
  end if;
  update payments set status = 'pago', paid_at = now(), method = coalesce(p_method, method), confirmed_by = p_by
    where id = p_payment returning * into result;
  update bookings set status = case when status = 'pre_reserva' then 'reservado' else status end, pay_pending = false, hold_until = null
    where id = pay.booking_id;
  if pay.kind = 'mensalidade' then
    select * into p from people where id = pay.person_id;
    was_blocked := billing_status(p.id) = 'bloqueado';
    nxt := coalesce(p.due_date, current_date) + 30;
    while nxt <= current_date loop nxt := nxt + 30; end loop;      -- mantém o dia do ciclo
    update people set due_date = nxt, plan = pay.plan, blocked_at = null where id = p.id;
    -- desbloqueou: a reserva fixa volta a reservar a semana
    if was_blocked then
      for rec in select * from recurrences where person_id = p.id loop
        perform materialize_recurrence(rec.id);   -- mesma rotina do job semanal de recorrência
      end loop;
    end if;
  end if;
  insert into whatsapp_outbox(box_id, person_id, kind, payload, meta_category)
    select pay.box_id, pay.person_id, 'billing', jsonb_build_object('template','pagamento_confirmado','payment_id',pay.id), 'utilidade'
    from boxes where id = pay.box_id and dispatch_billing;
  return result;
end $$;

-- Job diário: carência → bloqueio. Ao bloquear, libera as vagas futuras (lista de espera é promovida).
create or replace function enforce_billing() returns void language plpgsql security definer as $$
declare r record; bk bookings;
begin
  for r in select p.* from people p where p.role = 'aluno' and p.blocked_at is null and billing_status(p.id) = 'bloqueado' loop
    update people set blocked_at = now() where id = r.id;
    delete from waitlist where person_id = r.id;
    for bk in select b.* from bookings b join class_sessions cs on cs.id = b.session_id
              where b.person_id = r.id and b.status in ('reservado','pre_reserva') and cs.starts_at > now() loop
      update bookings set cancel_reason = 'inadimplencia' where id = bk.id;
      perform cancel_booking(bk.id, 'sistema', true);
    end loop;
    insert into whatsapp_outbox(box_id, person_id, kind, payload, meta_category)
      select r.box_id, r.id, 'billing', jsonb_build_object('template','acesso_suspenso'), 'utilidade'
      from boxes where id = r.box_id and dispatch_billing;
  end loop;
  -- primeiro dia de carência: lembrete (se o disparo estiver ligado)
  insert into whatsapp_outbox(box_id, person_id, kind, payload, meta_category)
    select p.box_id, p.id, 'billing', jsonb_build_object('template','mensalidade_carencia','due_date',p.due_date), 'utilidade'
    from people p join boxes b on b.id = p.box_id
    where b.dispatch_billing and p.role = 'aluno' and p.due_date = current_date - 1;
  -- quem pagou ou teve a carência ampliada sai do bloqueio
  update people set blocked_at = null where blocked_at is not null and billing_status(id) <> 'bloqueado';
end $$;

-- Pré-reservas sem pagamento: vaga volta para a grade e a fila anda
create or replace function expire_holds() returns void language plpgsql security definer as $$
declare bk bookings;
begin
  for bk in select * from bookings where status = 'pre_reserva' and hold_until < now() for update skip locked loop
    update bookings set status = 'expirado', hold_until = null where id = bk.id;
    update payments set status = 'expirado' where booking_id = bk.id and status = 'pendente';
    perform promote_waitlist(bk.session_id);
  end loop;
end $$;

-- Agendamentos (extensão pg_cron)
select cron.schedule('ds_enforce_billing', '5 3 * * *', $$select enforce_billing()$$);  -- 00:05 em Brasília (03:05 UTC)
select cron.schedule('ds_expire_holds', '* * * * *', $$select expire_holds()$$);

-- ---------- Realtime + RLS ----------
alter publication supabase_realtime add table bookings, class_sessions, notices, waitlist, stories, payments;
alter table payments enable row level security;
create policy payments_own on payments for select
  using (person_id in (select id from people where auth_user_id = auth.uid()) or is_staff(box_id));
-- baixa manual só pela equipe (via RPC confirm_payment com p_by = gestor); webhook usa service_role

alter table people enable row level security;
alter table bookings enable row level security;
-- sem policy: acesso só pelas RPCs (security definer) e service_role
alter table boxes enable row level security;
alter table schedule_slots enable row level security;
alter table recurrences enable row level security;
alter table checkin_tokens enable row level security;
alter table badges enable row level security;
alter table person_badges enable row level security;
alter table whatsapp_outbox enable row level security;
alter table bot_sessions enable row level security;
alter table health_forms enable row level security;
alter table referral_rewards enable row level security;   -- sem acesso direto do aluno (my_referral)
alter table notices enable row level security;
-- notices: aluno lê só 'published'; coach lê publicados + os próprios; admin lê/aprova/recusa tudo.
--   Status e autoria no trigger notices_before_write (20261127; sem fila paga desde 20261128_comunidade_whatsapp.sql).
-- (versão anterior:) trigger notices_before_write
--   (autoria + fila whatsapp_outbox do alerta urgente) → migrations/20261125_mural_avisos.sql
-- (políticas: aluno lê/edita só as próprias reservas; coach/owner do mesmo box lê tudo;
--  health_forms visível apenas para coach/owner; bot usa service_role via Edge Function)

-- ---------- Treino do Dia: alunos do box leem; coach/owner lançam, editam e apagam ----------
alter table daily_wods enable row level security;

create policy daily_wods_read on daily_wods for select to authenticated
  using (is_member(box_id));
create policy daily_wods_insert on daily_wods for insert to authenticated
  with check (is_staff(box_id));
create policy daily_wods_update on daily_wods for update to authenticated
  using (is_staff(box_id)) with check (is_staff(box_id));
create policy daily_wods_delete on daily_wods for delete to authenticated
  using (is_staff(box_id));

revoke all on daily_wods from anon, authenticated;
grant select, insert, update, delete on daily_wods to authenticated;

-- ---------- Stories: acesso ----------
alter table stories enable row level security;
alter table story_views enable row level security;

create policy stories_read on stories for select
  using (is_member(box_id) and (expires_at > now() or is_staff(box_id)));
create policy stories_post on stories for insert
  with check (is_staff(box_id) and author_id = (my_person(box_id)).id);
create policy stories_delete on stories for delete
  using (is_staff(box_id));

create policy story_views_own on story_views for all
  using (person_id in (select id from people where auth_user_id = auth.uid()))
  with check (person_id in (select id from people where auth_user_id = auth.uid()));

-- Bucket privado das fotos (alunos leem por URL assinada; só a equipe envia/apaga)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy stories_files_read on storage.objects for select
  using (bucket_id = 'stories' and is_member(((storage.foldername(name))[1])::uuid));
create policy stories_files_upload on storage.objects for insert
  with check (bucket_id = 'stories' and is_staff(((storage.foldername(name))[1])::uuid));
create policy stories_files_delete on storage.objects for delete
  using (bucket_id = 'stories' and is_staff(((storage.foldername(name))[1])::uuid));

-- Limpeza: uma Edge Function agendada (diária) apaga do Storage as fotos de stories
-- com expires_at < now() - 7 dias e depois remove as linhas. Arquivos do Storage
-- devem ser apagados pela API do Storage, não por DELETE direto em storage.objects.

-- Identidade visual do box para a tela antes do login (o RLS de boxes não abre a tabela).
-- Devolve só nome e cores. Logos: bucket público `assets` (sem policy de SELECT, para não permitir listar).
create or replace function get_box_branding(p_box uuid)
returns table (id uuid, name text, brand_primary text, brand_secondary text)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.brand_primary, b.brand_secondary from boxes b where b.id = p_box
$$;
revoke execute on function get_box_branding(uuid) from public;
grant execute on function get_box_branding(uuid) to anon, authenticated, service_role;

-- Contato público do box (página /clientes/:slug): endereço, Instagram e WhatsApp.
-- Os dados do Içara são gravados em migrations/20261202_box_contato.sql.
create or replace function get_box_contact(p_slug text)
returns table (address text, instagram_url text, whatsapp text)
language sql stable security definer set search_path = public as $$
  select b.address, b.instagram_url, b.whatsapp from boxes b where b.slug = p_slug
$$;
revoke execute on function get_box_contact(text) from public;
grant execute on function get_box_contact(text) to anon, authenticated, service_role;

-- =====================================================================
-- Gestão da equipe (Painel → Alunos → Equipe). Migration: migrations/20261208_gestao_equipe.sql
-- A migration também refaz is_staff / is_owner / _is_box_coach / staff_coaches (só equipe
-- ativa) e admin_members (e-mail, active, aulas do coach). Funções plpgsql: as tabelas das
-- migrations (coach_swaps, auth) são resolvidas na execução.
-- =====================================================================

-- ---------- aulas de um coach (a transferir) ----------
-- Início de "hoje" no fuso do box: a partir daí as aulas contam como futuras.
create or replace function _box_today_start(p_box uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((now() at time zone b.timezone)::date)::timestamp at time zone b.timezone from boxes b where b.id = p_box
$$;
revoke execute on function _box_today_start(uuid) from public, anon, authenticated;

-- fixed_slots: turmas ativas da grade em que ele é o coach fixo.
-- future_sessions: aulas de hoje em diante (não canceladas) em que ele é o coach da data.
create or replace function _coach_load(p_box uuid, p_coach uuid, out fixed_slots int, out future_sessions int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from schedule_slots sl where sl.box_id = p_box and sl.coach_id = p_coach and sl.active),
    (select count(*)::int from class_sessions s left join schedule_slots sl on sl.id = s.slot_id
      where s.box_id = p_box and not s.cancelled and s.starts_at >= _box_today_start(p_box)
        and coalesce(s.coach_override, sl.coach_id) = p_coach)
$$;
revoke execute on function _coach_load(uuid, uuid) from public, anon, authenticated;

-- ---------- editar membro da equipe ----------
-- p_role: 'owner' | 'coach' | 'aluno'. p_email só vale para quem tem conta no app
-- (muda o e-mail de login). Devolve a linha atualizada de people.
create or replace function admin_update_team_member(
  p_box uuid, p_person uuid, p_name text, p_phone text, p_email text,
  p_birth_date date, p_role member_role, p_can_publish boolean
) returns people
language plpgsql security definer set search_path = public, auth as $$
declare
  p people; v_name text; v_phone text; v_email text; v_old_email text; v_load record; result people;
begin
  perform _assert_owner(p_box);
  select * into p from people where id = p_person and box_id = p_box for update;
  if p.id is null or p.role not in ('owner', 'coach') then raise exception 'MEMBRO_NAO_ENCONTRADO'; end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if length(v_name) < 3 or length(v_name) > 80 or position(' ' in v_name) = 0 then
    raise exception 'NOME_INVALIDO: Informe o nome completo (nome e sobrenome).';
  end if;

  v_phone := normalize_phone(p_phone);
  if v_phone is null or length(v_phone) not in (12, 13) then raise exception 'TELEFONE_INVALIDO'; end if;
  if exists (select 1 from people where box_id = p_box and id <> p_person and normalize_phone(phone) = v_phone) then
    raise exception 'TELEFONE_EM_USO';
  end if;

  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1900-01-01') then
    raise exception 'DATA_INVALIDA';
  end if;

  if p_role is null or p_role not in ('owner', 'coach', 'aluno') then raise exception 'PAPEL_INVALIDO'; end if;
  if p_role = 'owner' and not p.active then raise exception 'MEMBRO_INATIVO'; end if;
  -- o box nunca fica sem administrador ativo
  if p.role = 'owner' and p_role <> 'owner' and not exists (
       select 1 from people where box_id = p_box and id <> p_person and role = 'owner' and active) then
    raise exception 'ULTIMO_ADMIN';
  end if;
  -- quem vira aluno não pode levar aulas junto: transfira antes (Desativar coach)
  if p_role = 'aluno' then
    select * into v_load from _coach_load(p_box, p_person);
    if v_load.fixed_slots > 0 or v_load.future_sessions > 0 then raise exception 'COACH_COM_AULAS'; end if;
  end if;

  -- e-mail de login (auth.users)
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if p.auth_user_id is null then
    if v_email is not null then raise exception 'SEM_CONTA_APP'; end if;
  else
    select lower(email) into v_old_email from auth.users where id = p.auth_user_id;
    if v_email is null then raise exception 'EMAIL_INVALIDO'; end if;
    if v_email is distinct from v_old_email then
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then raise exception 'EMAIL_INVALIDO'; end if;
      if exists (select 1 from auth.users where lower(email) = v_email and id <> p.auth_user_id) then
        raise exception 'EMAIL_EM_USO';
      end if;
      update auth.users set email = v_email, updated_at = now() where id = p.auth_user_id;
      update auth.identities
         set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)), updated_at = now()
       where user_id = p.auth_user_id and provider = 'email';
    end if;
  end if;

  update people set
    name = v_name,
    phone = v_phone,
    birth_date = p_birth_date,
    role = p_role,
    -- a permissão de publicar direto só existe para coach
    can_publish_notices_directly = case when p_role = 'coach' then coalesce(p_can_publish, false) else false end
  where id = p_person
  returning * into result;
  return result;
end $$;

-- ---------- desativar coach com transferência obrigatória ----------
-- Atômico: valida, transfere grade fixa + aulas de hoje em diante, encerra as trocas
-- pendentes e marca o coach como inativo. p_replacement_coach_id é obrigatório
-- quando o coach tem turma fixa ativa ou aula futura.
-- Devolve {slots, sessions, swaps}: quantos itens foram transferidos/encerrados.
create or replace function deactivate_coach(p_box_id uuid, p_coach_id uuid, p_replacement_coach_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c people; v_today timestamptz; v_load record; v_slots int := 0; v_sessions int := 0; v_swaps int := 0; n int;
begin
  perform _assert_owner(p_box_id);
  select * into c from people where id = p_coach_id and box_id = p_box_id for update;
  if c.id is null then raise exception 'MEMBRO_NAO_ENCONTRADO'; end if;
  if c.role <> 'coach' then raise exception 'NAO_E_COACH'; end if;
  if not c.active then raise exception 'MEMBRO_INATIVO'; end if;
  if c.id = caller_person(p_box_id) then raise exception 'SEM_PERMISSAO'; end if;

  v_today := _box_today_start(p_box_id);
  select * into v_load from _coach_load(p_box_id, p_coach_id);

  if p_replacement_coach_id is not null then
    if p_replacement_coach_id = p_coach_id or not _is_box_coach(p_box_id, p_replacement_coach_id) then
      raise exception 'SUBSTITUTO_INVALIDO';
    end if;
    -- trava o substituto: ninguém o desativa no meio desta transação
    perform 1 from people where id = p_replacement_coach_id for share;
  elsif v_load.fixed_slots > 0 or v_load.future_sessions > 0 then
    raise exception 'SUBSTITUTO_OBRIGATORIO';
  end if;

  if p_replacement_coach_id is not null then
    -- 1. grade fixa. Aulas passadas dessas turmas guardam quem deu a aula (métricas e histórico).
    update class_sessions s set coach_override = p_coach_id
      from schedule_slots sl
     where sl.id = s.slot_id and sl.box_id = p_box_id and sl.coach_id = p_coach_id
       and s.starts_at < v_today and s.coach_override is null;

    -- (as aulas futuras que seguem a turma, sem override, passam junto com a grade)
    update schedule_slots set coach_id = p_replacement_coach_id
     where box_id = p_box_id and coach_id = p_coach_id;

    -- 2. aulas de hoje em diante com o coach só naquela data (coach_override):
    --    passam para o substituto, ou voltam a seguir a turma se ele já é o coach fixo dela
    update class_sessions s
       set coach_override = case when sl.coach_id = p_replacement_coach_id then null else p_replacement_coach_id end
      from schedule_slots sl
     where sl.id = s.slot_id and s.box_id = p_box_id and s.starts_at >= v_today and s.coach_override = p_coach_id;
    -- aulas especiais (sem turma fixa)
    update class_sessions set coach_override = p_replacement_coach_id
     where box_id = p_box_id and slot_id is null and starts_at >= v_today and coach_override = p_coach_id;
    -- aulas futuras das turmas transferidas que estavam "trocadas" para o próprio substituto
    -- agora seguem a turma (mesma regra de admin_set_slot_coach)
    update class_sessions s set coach_override = null
      from schedule_slots sl
     where sl.id = s.slot_id and s.box_id = p_box_id and s.starts_at >= v_today
       and sl.coach_id = p_replacement_coach_id and s.coach_override = p_replacement_coach_id;

    v_slots := coalesce(v_load.fixed_slots, 0);
    v_sessions := coalesce(v_load.future_sessions, 0);
  end if;

  -- 3. trocas pendentes envolvendo o coach: as que ele pediu são canceladas,
  --    as que pediram para ele são recusadas
  update coach_swaps set status = 'cancelada', decided_at = now()
   where box_id = p_box_id and status = 'pendente' and from_coach = p_coach_id;
  get diagnostics n = row_count;
  v_swaps := n;
  update coach_swaps set status = 'recusada', decided_at = now()
   where box_id = p_box_id and status = 'pendente' and to_coach = p_coach_id;
  get diagnostics n = row_count;
  v_swaps := v_swaps + n;

  -- 4. inativo: sem acesso de equipe, fora dos seletores de aula e de troca
  update people set active = false, deactivated_at = now(), can_publish_notices_directly = false
   where id = p_coach_id;

  return jsonb_build_object('slots', v_slots, 'sessions', v_sessions, 'swaps', v_swaps);
end $$;

create or replace function reactivate_coach(p_box_id uuid, p_coach_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare c people;
begin
  perform _assert_owner(p_box_id);
  select * into c from people where id = p_coach_id and box_id = p_box_id for update;
  if c.id is null then raise exception 'MEMBRO_NAO_ENCONTRADO'; end if;
  if c.role <> 'coach' then raise exception 'NAO_E_COACH'; end if;
  if c.active then return; end if;
  update people set active = true, deactivated_at = null where id = p_coach_id;
end $$;

-- ---------- permissões ----------
revoke execute on function
  admin_members(uuid),
  admin_update_team_member(uuid, uuid, text, text, text, date, member_role, boolean),
  deactivate_coach(uuid, uuid, uuid),
  reactivate_coach(uuid, uuid)
from public, anon;
grant execute on function
  admin_members(uuid),
  admin_update_team_member(uuid, uuid, text, text, text, date, member_role, boolean),
  deactivate_coach(uuid, uuid, uuid),
  reactivate_coach(uuid, uuid)
to authenticated, service_role;
