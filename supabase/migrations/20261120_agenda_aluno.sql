-- =====================================================================
-- Agenda do Aluno: sessões da semana, reserva/fila/cancelamento e login de teste
--
-- Depende de: schema.sql, 20261118_session_counters.sql, 20261118_lock_rpcs.sql
--             e 20261119_icara_training_club.sql (modalities, boxes.slug).
--
-- O que entra:
--   1. ensure_sessions(box, dias)   → cria as class_sessions a partir da grade fixa
--      (job diário no pg_cron + chamada sob demanda em get_agenda).
--   2. get_agenda(box, dias)        → aulas dos próximos dias com modalidade, coach,
--      vagas e a situação de quem está logado (inscrito / na fila).
--   3. app_book_class(aula, pessoa, fila) → reserva; se lotada e fila = true, entra
--      na lista de espera. Tudo com a aula travada (FOR UPDATE).
--      app_cancel_booking(reserva)  → cancela e o 1º da fila é promovido sozinho.
--      app_leave_waitlist(aula)     → sai da fila.
--   4. Login de teste: boxes.test_login_enabled + people.is_test.
--      list_test_people / claim_test_person ligam o usuário anônimo do Supabase
--      a um aluno de teste. DESLIGUE test_login_enabled antes de abrir para alunos reais.
--
-- book_class / cancel_booking (usados pelo bot) continuam iguais. As funções app_*
-- reaproveitam a mesma lógica (_book_class / cancel_booking) e devolvem JSON pronto
-- para a tela. Erros saem como código (ex.: TURMA_LOTADA) e o front traduz em
-- src/lib/api/errors.js.
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------- colunas novas ----------
alter table boxes  add column if not exists test_login_enabled boolean not null default false;
alter table people add column if not exists is_test            boolean not null default false;

-- Busca da agenda por box + data
create index if not exists class_sessions_box_starts_idx on class_sessions (box_id, starts_at);
create index if not exists waitlist_session_position_idx on waitlist (session_id, position);


-- =====================================================================
-- 1. Sessões a partir da grade fixa
-- =====================================================================
-- Cria (se ainda não existirem) as aulas de hoje até hoje + p_days - 1, no fuso do box.
-- Não mexe em aulas já criadas (capacidade/coach ajustados por data ficam como estão).
create or replace function ensure_sessions(p_box uuid, p_days int default 8)
returns int language plpgsql security definer set search_path = public as $$
declare bx boxes; v_today date; n int;
begin
  select * into bx from boxes where id = p_box;
  if bx.id is null then return 0; end if;
  v_today := (now() at time zone bx.timezone)::date;

  insert into class_sessions (slot_id, box_id, starts_at)
  select sl.id, sl.box_id, (d.day::date + sl.start_time) at time zone bx.timezone
    from generate_series(v_today, v_today + greatest(least(p_days, 60), 1) - 1, interval '1 day') as d(day)
    join schedule_slots sl
      on sl.box_id = p_box and sl.active and sl.weekday = extract(dow from d.day)
  on conflict (slot_id, starts_at) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- Job diário (00:10 em Brasília): mantém 8 dias de aulas criados em todos os boxes.
-- Também é chamado por get_agenda, então a agenda nunca aparece vazia por falta do job.
do $$ begin
  perform cron.schedule('ds_ensure_sessions', '10 3 * * *', 'select ensure_sessions(id, 8) from boxes');
exception when others then
  raise notice 'pg_cron indisponível: agende ensure_sessions manualmente (%).', sqlerrm;
end $$;


-- =====================================================================
-- 2. Leitura da agenda
-- =====================================================================
-- Uma chamada traz a semana inteira. Só membros do box (aluno/coach/owner).
-- Devolve o nome do coach sem abrir a tabela people (o RLS dela só mostra o próprio cadastro).
create or replace function get_agenda(p_box uuid, p_days int default 7)
returns table (
  session_id        uuid,
  starts_at         timestamptz,
  day               date,          -- data no fuso do box
  start_time        text,          -- 'HH:MI'
  duration_min      int,
  modality_code     text,
  modality_name     text,
  modality_color    text,
  label             text,
  level             class_level,
  coach_name        text,
  capacity          int,
  booked_count      int,
  waitlist_count    int,
  cancelled         boolean,
  closed            boolean,
  my_booking_id     uuid,
  my_booking_status booking_status,
  my_waitlist_pos   int            -- 1 = próximo a entrar
)
language plpgsql security definer set search_path = public as $$
declare bx boxes; v_me uuid; v_today date; v_days int := greatest(least(coalesce(p_days, 7), 14), 1);
begin
  select * into bx from boxes where id = p_box;
  if bx.id is null then raise exception 'BOX_NAO_ENCONTRADO'; end if;

  if not is_trusted_caller() then
    if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
    if not is_member(p_box) then raise exception 'SEM_PERMISSAO'; end if;
  end if;
  v_me := caller_person(p_box);

  perform ensure_sessions(p_box, v_days + 1);
  v_today := (now() at time zone bx.timezone)::date;

  return query
  select
    s.id,
    s.starts_at,
    (s.starts_at at time zone bx.timezone)::date,
    to_char(s.starts_at at time zone bx.timezone, 'HH24:MI'),
    sl.duration_min,
    m.code,
    m.name,
    m.color,
    sl.label,
    sl.level,
    c.name,
    coalesce(s.capacity_override, sl.capacity),
    s.booked_count,
    s.waitlist_count,
    s.cancelled,
    s.closed_at is not null,
    mb.id,
    mb.status,
    wl.pos::int
  from class_sessions s
  join schedule_slots sl on sl.id = s.slot_id
  left join modalities m on m.id = sl.modality_id
  left join people c on c.id = coalesce(s.coach_override, sl.coach_id)
  left join lateral (
    select b.id, b.status from bookings b
     where b.session_id = s.id and b.person_id = v_me
       and b.status in ('reservado','presente','pre_reserva')
     order by b.created_at desc limit 1
  ) mb on true
  left join lateral (
    select x.pos from (
      select w.person_id, row_number() over (order by w.position) as pos
        from waitlist w where w.session_id = s.id
    ) x where x.person_id = v_me
  ) wl on true
  where s.box_id = p_box
    and s.starts_at >= v_today::timestamp at time zone bx.timezone
    and s.starts_at <  (v_today + v_days)::timestamp at time zone bx.timezone
  order by s.starts_at;
end $$;


-- =====================================================================
-- 3. Reserva / fila / cancelamento (chamadas pelo app)
-- =====================================================================

-- Quem pode agir por p_person: ele mesmo, a equipe do box ou o sistema (bot/cron).
create or replace function _assert_can_act_for(p_box uuid, p_person uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from people where id = p_person and box_id = p_box) then
    raise exception 'SEM_PERMISSAO';
  end if;
  if is_trusted_caller() then return; end if;
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  if is_staff(p_box) then return; end if;
  if caller_person(p_box) is distinct from p_person then raise exception 'SEM_PERMISSAO'; end if;
end $$;

-- Reservar. Com p_waitlist = true e turma lotada, entra na lista de espera.
-- Retorno: { "result": "reservado", "booking_id": … } ou { "result": "fila", "position": 3 }
create or replace function app_book_class(p_session uuid, p_person uuid, p_waitlist boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; p people;
  cap int; taken int; weekly int; v_source channel; bk bookings; v_pos int;
begin
  -- trava a aula: duas pessoas disputando a última vaga ficam em fila aqui
  select * into s from class_sessions where id = p_session for update;
  if s.id is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  perform _assert_can_act_for(s.box_id, p_person);

  select * into sl from schedule_slots where id = s.slot_id;
  select * into bx from boxes where id = s.box_id;
  select * into p from people where id = p_person;

  if exists (select 1 from bookings where session_id = p_session and person_id = p_person
               and status in ('reservado','presente','pre_reserva')) then
    raise exception 'JA_INSCRITO';
  end if;

  cap := coalesce(s.capacity_override, sl.capacity);
  select count(*) into taken from bookings
   where session_id = p_session and status in ('reservado','presente','pre_reserva');

  -- Tem vaga: mesma regra do bot (_book_class: prazo, plano, financeiro, lotação)
  if taken < cap then
    v_source := case when is_trusted_caller() then 'sistema'
                     when caller_person(s.box_id) = p_person then 'web'
                     else 'coach' end;
    bk := _book_class(p_session, p_person, 'avulso', v_source, false);
    return jsonb_build_object('result', 'reservado', 'booking_id', bk.id);
  end if;

  if not p_waitlist then raise exception 'TURMA_LOTADA'; end if;

  -- Lotada → lista de espera. Valida o que faria a promoção falhar depois,
  -- para o aluno saber agora (e não ficar numa fila que nunca vai andar).
  if s.cancelled or s.closed_at is not null or s.starts_at <= now() then
    raise exception 'AULA_ENCERRADA';
  end if;
  if (s.starts_at at time zone bx.timezone)::date - (now() at time zone bx.timezone)::date > bx.book_ahead_days then
    raise exception 'AGENDA_FECHADA';
  end if;
  if p.role = 'aluno' and billing_status(p_person) = 'bloqueado' then raise exception 'ACESSO_BLOQUEADO'; end if;
  if p.role = 'aluno' and p.plan <> 'ilimitado' then
    select count(*) into weekly from bookings b join class_sessions cs on cs.id = b.session_id
     where b.person_id = p_person and b.status in ('reservado','presente','pre_reserva') and b.type <> 'extra'
       and date_trunc('week', cs.starts_at) = date_trunc('week', s.starts_at);
    if weekly >= (case p.plan when '2x' then 2 else 3 end) then raise exception 'LIMITE_PLANO'; end if;
  end if;
  if exists (select 1 from waitlist where session_id = p_session and person_id = p_person) then
    raise exception 'JA_NA_FILA';
  end if;

  insert into waitlist (session_id, person_id) values (p_session, p_person);
  select count(*) into v_pos from waitlist
   where session_id = p_session
     and position <= (select position from waitlist where session_id = p_session and person_id = p_person);
  return jsonb_build_object('result', 'fila', 'position', v_pos);
end $$;

-- Cancelar a própria reserva (equipe: qualquer reserva do box).
-- cancel_booking já checa permissão e prazo (FORA_DO_PRAZO) e promove o 1º da fila.
create or replace function app_cancel_booking(p_booking uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_before int; v_after int;
begin
  select session_id into v_session from bookings where id = p_booking;
  if v_session is null then raise exception 'RESERVA_NAO_ENCONTRADA'; end if;
  select booked_count into v_before from class_sessions where id = v_session;

  perform cancel_booking(p_booking, 'web', false);

  -- se a contagem de vagas não caiu, alguém da fila entrou no lugar
  select booked_count into v_after from class_sessions where id = v_session;
  return jsonb_build_object('result', 'cancelado', 'promoted', coalesce(v_after >= v_before, false));
end $$;

-- Sair da lista de espera (o próprio aluno).
create or replace function app_leave_waitlist(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_box uuid; v_me uuid;
begin
  select box_id into v_box from class_sessions where id = p_session;
  if v_box is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  v_me := caller_person(v_box);
  if v_me is null then raise exception 'SEM_PERMISSAO'; end if;
  delete from waitlist where session_id = p_session and person_id = v_me;
  if not found then raise exception 'NAO_NA_FILA'; end if;
  return jsonb_build_object('result', 'saiu_da_fila');
end $$;


-- =====================================================================
-- 4. Login de teste (temporário, até o login real por WhatsApp/e-mail)
-- =====================================================================
-- Fluxo no app: supabase.auth.signInAnonymously() → claim_test_person(pessoa).
-- Requer "Allow anonymous sign-ins" ligado em Authentication → Sign In / Providers.
-- Só funciona para people.is_test = true e com boxes.test_login_enabled = true.

-- Box pelo slug (tela antes do login): id, nome, cores, prazos da agenda e se o login de teste está ligado.
drop function if exists get_box_public(text);
create function get_box_public(p_slug text)
returns table (id uuid, slug text, name text, brand_primary text, brand_secondary text,
               min_cancel_minutes int, book_ahead_days int, test_login_enabled boolean)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.brand_primary, b.brand_secondary,
         b.min_cancel_minutes, b.book_ahead_days, b.test_login_enabled
    from boxes b where b.slug = p_slug
$$;

-- Alunos de teste do box (telefone mascarado). Vazio se o login de teste estiver desligado.
create or replace function list_test_people(p_box uuid)
returns table (id uuid, name text, role member_role, plan plan_kind, billing text, phone_hint text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.plan, billing_status(p.id), '•••• ' || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
    from people p join boxes b on b.id = p.box_id
   where p.box_id = p_box and p.is_test and b.test_login_enabled
   order by p.role, p.name
$$;

-- Liga o usuário logado (anônimo) a um aluno de teste. Solta qualquer vínculo anterior desse usuário.
create or replace function claim_test_person(p_person uuid)
returns people language plpgsql security definer set search_path = public as $$
declare p people;
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  select pp.* into p from people pp join boxes b on b.id = pp.box_id
   where pp.id = p_person and pp.is_test and b.test_login_enabled;
  if p.id is null then raise exception 'TESTE_DESATIVADO'; end if;

  update people set auth_user_id = null where auth_user_id = auth.uid() and id <> p_person;
  update people set auth_user_id = auth.uid() where id = p_person returning * into p;
  return p;
end $$;


-- =====================================================================
-- Realtime + permissões
-- =====================================================================
-- O Realtime respeita o RLS: o aluno precisa poder LER class_sessions do box para
-- receber os UPDATEs de booked_count/waitlist_count (ver 20261118_session_counters.sql).
alter table class_sessions enable row level security;
drop policy if exists class_sessions_read on class_sessions;
create policy class_sessions_read on class_sessions for select to authenticated
  using (is_member(box_id));
grant select on class_sessions to authenticated;

-- bookings / class_sessions / waitlist já estão na publicação supabase_realtime (schema.sql).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'class_sessions') then
    alter publication supabase_realtime add table class_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'bookings') then
    alter publication supabase_realtime add table bookings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'waitlist') then
    alter publication supabase_realtime add table waitlist;
  end if;
end $$;

revoke execute on function ensure_sessions(uuid, int), _assert_can_act_for(uuid, uuid) from public, anon, authenticated;
grant  execute on function ensure_sessions(uuid, int) to service_role;

revoke execute on function
  get_agenda(uuid, int), app_book_class(uuid, uuid, boolean), app_cancel_booking(uuid),
  app_leave_waitlist(uuid), claim_test_person(uuid)
from public, anon;
grant execute on function
  get_agenda(uuid, int), app_book_class(uuid, uuid, boolean), app_cancel_booking(uuid),
  app_leave_waitlist(uuid), claim_test_person(uuid)
to authenticated, service_role;

revoke execute on function get_box_public(text), list_test_people(uuid) from public;
grant  execute on function get_box_public(text), list_test_people(uuid) to anon, authenticated, service_role;


-- =====================================================================
-- Dados de teste do Içara Training Club
-- =====================================================================
do $$
declare v_box uuid;
begin
  select id into v_box from boxes where slug = 'icara-training-club';
  if v_box is null then
    raise notice 'Box icara-training-club não encontrado: rode 20261119_icara_training_club.sql antes.';
    return;
  end if;

  update boxes set test_login_enabled = true where id = v_box;

  -- Telefones fictícios (+55 48 90000-000X). due_date relativo a hoje:
  --   Ana: plano livre em dia · Bruno: 2x em dia · Carla: vencida há 10 dias (bloqueada) · Diego: coach
  insert into people (box_id, name, phone, role, plan, due_date, is_test)
  values
    (v_box, 'Ana Teste (Livre)',     '+5548900000001', 'aluno', 'ilimitado', current_date + 20, true),
    (v_box, 'Bruno Teste (2x)',      '+5548900000002', 'aluno', '2x',        current_date + 10, true),
    (v_box, 'Carla Teste (vencida)', '+5548900000003', 'aluno', '3x',        current_date - 10, true),
    (v_box, 'Coach Diego (teste)',   '+5548900000004', 'coach', null,        null,              true)
  on conflict (box_id, phone, name) do update
    set role = excluded.role, plan = excluded.plan, due_date = excluded.due_date, is_test = true;

  perform ensure_sessions(v_box, 8);
end $$;

-- Antes de abrir para alunos reais:
--   update boxes set test_login_enabled = false where slug = 'icara-training-club';
