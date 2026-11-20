-- =====================================================================
-- Feriados e aulas especiais (Painel do administrador → Turmas)
--
-- Depende de: 20261120_agenda_aluno.sql (ensure_sessions, get_agenda),
--             20261123_painel_admin.sql (_assert_owner),
--             20261124_painel_coach.sql (staff_sessions).
--
-- A grade fixa (schedule_slots) NÃO muda. Tudo acontece em class_sessions, por data:
--
--   special_days (box, dia)       → "Feriado" ou "Data especial", com título (ex.: Feriado Nacional).
--     • feriado: todas as aulas da GRADE daquele dia ficam cancelled = true, com
--       cancel_reason = título. As reservas viram 'cancelado' (motivo 'feriado') e a fila é
--       apagada. ensure_sessions passa a criar já canceladas as aulas de dias de feriado
--       ainda não gerados (feriado marcado com semanas de antecedência).
--     • especial: só um destaque na agenda; a grade continua normal.
--     Tirar o feriado (ou trocar para "especial") reabre as aulas da grade que ele cancelou
--     e que ainda não começaram. As reservas canceladas NÃO voltam (o aluno reserva de novo).
--
--   Aula avulsa / especial         → class_sessions com slot_id = null e os dados da aula
--     na própria linha (label, duration_min, level, modality_id, capacity_override,
--     coach_override). Reserva, fila, check-in e encerramento usam as mesmas funções.
--
-- Antes: "status cancelado" de uma aula = class_sessions.cancelled (boolean). Mantido
-- assim; o motivo vai em cancel_reason.
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------- class_sessions: motivo do cancelamento + aula sem horário da grade ----------
alter table class_sessions alter column slot_id drop not null;

alter table class_sessions
  add column if not exists cancel_reason        text,
  add column if not exists cancelled_at         timestamptz,
  add column if not exists cancelled_by_holiday boolean not null default false,  -- reabre ao tirar o feriado
  -- preenchidos só nas aulas avulsas (slot_id null); nas da grade valem os de schedule_slots
  add column if not exists label        text,
  add column if not exists duration_min int,
  add column if not exists level        class_level,
  add column if not exists modality_id  uuid references modalities(id) on delete set null;

do $$ begin
  alter table class_sessions add constraint class_sessions_avulsa_ck check (
    slot_id is not null
    or (label is not null and duration_min between 15 and 240 and capacity_override between 1 and 200)
  );
exception when duplicate_object then null;
end $$;


-- ---------- datas especiais ----------
create table if not exists special_days (
  box_id     uuid not null references boxes(id) on delete cascade,
  day        date not null,
  kind       text not null default 'feriado' check (kind in ('feriado', 'especial')),
  title      text not null check (length(trim(title)) between 2 and 60),
  note       text check (note is null or length(note) <= 280),
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (box_id, day)
);

-- leitura direta só para quem é do box; escrita só pelas RPCs admin_* abaixo
alter table special_days enable row level security;
drop policy if exists special_days_read on special_days;
create policy special_days_read on special_days for select to authenticated using (is_member(box_id));
grant select on special_days to authenticated;

-- Realtime: a agenda aberta do aluno recarrega quando o box marca/tira um feriado
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'special_days') then
    alter publication supabase_realtime add table special_days;
  end if;
exception when undefined_object then
  raise notice 'publicação supabase_realtime não existe (banco fora do Supabase).';
end $$;


-- =====================================================================
-- ensure_sessions: igual a 20261120_agenda_aluno.sql, mas cria já canceladas as
-- aulas da grade em dias de feriado.
-- =====================================================================
create or replace function ensure_sessions(p_box uuid, p_days int default 8)
returns int language plpgsql security definer set search_path = public as $$
declare bx boxes; v_today date; n int;
begin
  select * into bx from boxes where id = p_box;
  if bx.id is null then return 0; end if;
  v_today := (now() at time zone bx.timezone)::date;

  insert into class_sessions (slot_id, box_id, starts_at, cancelled, cancel_reason, cancelled_at, cancelled_by_holiday)
  select sl.id, sl.box_id, (d.day::date + sl.start_time) at time zone bx.timezone,
         sd.day is not null, sd.title, case when sd.day is not null then now() end, sd.day is not null
    from generate_series(v_today, v_today + greatest(least(p_days, 60), 1) - 1, interval '1 day') as d(day)
    join schedule_slots sl
      on sl.box_id = p_box and sl.active and sl.weekday = extract(dow from d.day)
    left join special_days sd
      on sd.box_id = p_box and sd.day = d.day::date and sd.kind = 'feriado'
  on conflict (slot_id, starts_at) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;


-- =====================================================================
-- Cancelar / reabrir as aulas da grade de um dia (internas)
-- =====================================================================
create or replace function _holiday_cancel_day(p_box uuid, p_day date, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bx boxes; v_ids uuid[]; v_bookings int;
begin
  select * into bx from boxes where id = p_box;

  with upd as (
    update class_sessions s
       set cancelled = true, cancel_reason = p_reason, cancelled_at = now(), cancelled_by_holiday = true
     where s.box_id = p_box and s.slot_id is not null
       and (s.starts_at at time zone bx.timezone)::date = p_day
       and s.closed_at is null and s.starts_at > now()
       and (not s.cancelled or s.cancelled_by_holiday)
    returning s.id
  ) select coalesce(array_agg(id), '{}') into v_ids from upd;

  update bookings set status = 'cancelado', cancel_reason = 'feriado'
   where session_id = any(v_ids) and status in ('reservado', 'pre_reserva');
  get diagnostics v_bookings = row_count;

  delete from waitlist where session_id = any(v_ids);

  return jsonb_build_object('cancelled_sessions', coalesce(array_length(v_ids, 1), 0), 'cancelled_bookings', v_bookings);
end $$;

create or replace function _holiday_reopen_day(p_box uuid, p_day date)
returns int language plpgsql security definer set search_path = public as $$
declare bx boxes; n int;
begin
  select * into bx from boxes where id = p_box;
  update class_sessions s
     set cancelled = false, cancel_reason = null, cancelled_at = null, cancelled_by_holiday = false
   where s.box_id = p_box and s.cancelled_by_holiday
     and (s.starts_at at time zone bx.timezone)::date = p_day
     and s.starts_at > now();
  get diagnostics n = row_count;
  return n;
end $$;


-- =====================================================================
-- RPCs do painel (só owner)
-- =====================================================================

-- Datas especiais e aulas avulsas de hoje em diante (inclui dias que só têm aula avulsa).
create or replace function admin_special_days(p_box uuid, p_days int default 90)
returns table (
  day                date,
  kind               text,        -- feriado | especial | null (só aula avulsa)
  title              text,
  note               text,
  cancelled_sessions int,         -- aulas da grade canceladas pelo feriado
  regular_sessions   int,         -- aulas da grade ativas no dia (já geradas)
  sessions           jsonb        -- aulas avulsas: [{ session_id, start_time, label, duration_min, capacity, booked_count, coach_name, modality_name, modality_color, cancelled }]
)
language plpgsql security definer set search_path = public as $$
declare bx boxes; v_today date; v_end date;
begin
  perform _assert_owner(p_box);
  select * into bx from boxes where id = p_box;
  v_today := (now() at time zone bx.timezone)::date;
  v_end   := v_today + greatest(least(coalesce(p_days, 90), 366), 1);

  return query
  with days as (
    select sd.day from special_days sd where sd.box_id = p_box and sd.day >= v_today and sd.day < v_end
    union
    select (s.starts_at at time zone bx.timezone)::date from class_sessions s
     where s.box_id = p_box and s.slot_id is null
       and s.starts_at >= v_today::timestamp at time zone bx.timezone
       and s.starts_at <  v_end::timestamp at time zone bx.timezone
  )
  select d.day, sd.kind, sd.title, sd.note,
    (select count(*)::int from class_sessions s where s.box_id = p_box and s.slot_id is not null and s.cancelled_by_holiday
        and (s.starts_at at time zone bx.timezone)::date = d.day),
    (select count(*)::int from class_sessions s where s.box_id = p_box and s.slot_id is not null and not s.cancelled
        and (s.starts_at at time zone bx.timezone)::date = d.day),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'session_id', s.id,
              'start_time', to_char(s.starts_at at time zone bx.timezone, 'HH24:MI'),
              'label', s.label,
              'duration_min', s.duration_min,
              'capacity', s.capacity_override,
              'booked_count', s.booked_count,
              'coach_name', c.name,
              'modality_name', m.name,
              'modality_color', m.color,
              'cancelled', s.cancelled) order by s.starts_at), '[]'::jsonb)
       from class_sessions s
       left join people c on c.id = s.coach_override
       left join modalities m on m.id = s.modality_id
      where s.box_id = p_box and s.slot_id is null
        and (s.starts_at at time zone bx.timezone)::date = d.day)
  from days d
  left join special_days sd on sd.box_id = p_box and sd.day = d.day
  order by d.day;
end $$;

-- Marca (ou altera) a data. Feriado cancela a grade do dia; especial reabre o que um feriado cancelou.
create or replace function admin_set_special_day(p_box uuid, p_day date, p_kind text, p_title text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bx boxes; v_today date; v_title text := trim(coalesce(p_title, '')); v_res jsonb; v_reopened int := 0;
begin
  perform _assert_owner(p_box);
  select * into bx from boxes where id = p_box;
  v_today := (now() at time zone bx.timezone)::date;
  if p_day is null or p_day < v_today then raise exception 'DATA_PASSADA'; end if;
  if p_kind not in ('feriado', 'especial') then raise exception 'TIPO_DATA_INVALIDO'; end if;
  if length(v_title) < 2 or length(v_title) > 60 then raise exception 'TITULO_INVALIDO'; end if;

  insert into special_days (box_id, day, kind, title, note, created_by)
  values (p_box, p_day, p_kind, v_title, nullif(trim(coalesce(p_note, '')), ''), caller_person(p_box))
  on conflict (box_id, day) do update
    set kind = excluded.kind, title = excluded.title, note = excluded.note, updated_at = now();

  if p_kind = 'feriado' then
    -- gera as aulas do dia se ainda não existirem (já nascem canceladas) e cancela as que já existiam
    if p_day - v_today < 60 then perform ensure_sessions(p_box, p_day - v_today + 1); end if;
    v_res := _holiday_cancel_day(p_box, p_day, v_title);
  else
    v_reopened := _holiday_reopen_day(p_box, p_day);
    v_res := jsonb_build_object('cancelled_sessions', 0, 'cancelled_bookings', 0);
  end if;
  return v_res || jsonb_build_object('reopened_sessions', v_reopened);
end $$;

-- Tira a marcação. As aulas da grade canceladas pelo feriado voltam; as avulsas ficam.
create or replace function admin_remove_special_day(p_box uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_reopened int;
begin
  perform _assert_owner(p_box);
  delete from special_days where box_id = p_box and day = p_day;
  if not found then raise exception 'DATA_NAO_ENCONTRADA'; end if;
  v_reopened := _holiday_reopen_day(p_box, p_day);
  return jsonb_build_object('reopened_sessions', v_reopened);
end $$;

-- Aula avulsa / especial numa data (ex.: "Aulão de Feriado" às 09:00). Não entra na grade.
create or replace function admin_create_special_session(
  p_box uuid, p_day date, p_time time, p_label text,
  p_duration int default 60, p_capacity int default 20,
  p_modality uuid default null, p_coach uuid default null, p_level class_level default 'misto'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare bx boxes; v_start timestamptz; v_label text := trim(coalesce(p_label, '')); v_id uuid;
begin
  perform _assert_owner(p_box);
  select * into bx from boxes where id = p_box;
  if p_day is null or p_time is null then raise exception 'HORARIO_INVALIDO'; end if;
  v_start := (p_day + p_time) at time zone bx.timezone;
  if v_start <= now() then raise exception 'DATA_PASSADA'; end if;
  if length(v_label) < 2 or length(v_label) > 60 then raise exception 'TITULO_INVALIDO'; end if;
  if p_duration is null or p_duration not between 15 and 240 then raise exception 'DURACAO_INVALIDA'; end if;
  if p_capacity is null or p_capacity not between 1 and 200 then raise exception 'CAPACIDADE_INVALIDA'; end if;
  if p_modality is not null and not exists (select 1 from modalities where id = p_modality and box_id = p_box) then
    raise exception 'SEM_PERMISSAO';
  end if;
  if p_coach is not null and not exists (select 1 from people where id = p_coach and box_id = p_box and role in ('coach', 'owner')) then
    raise exception 'SEM_PERMISSAO';
  end if;

  insert into class_sessions (slot_id, box_id, starts_at, label, duration_min, level, modality_id, capacity_override, coach_override)
  values (null, p_box, v_start, v_label, p_duration, coalesce(p_level, 'misto'), p_modality, p_capacity, p_coach)
  returning id into v_id;
  return v_id;
end $$;

-- Tira uma aula avulsa: sem reservas, apaga; com reservas, cancela (reservas viram 'cancelado').
create or replace function admin_cancel_special_session(p_session uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s class_sessions; n int;
begin
  select * into s from class_sessions where id = p_session for update;
  if s.id is null or s.slot_id is not null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  perform _assert_owner(s.box_id);
  if s.closed_at is not null then raise exception 'AULA_ENCERRADA'; end if;

  if not exists (select 1 from bookings where session_id = p_session) then
    delete from waitlist where session_id = p_session;
    delete from class_sessions where id = p_session;
    return jsonb_build_object('result', 'apagada');
  end if;

  update class_sessions set cancelled = true, cancelled_at = now(),
         cancel_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Aula cancelada pelo box')
   where id = p_session;
  update bookings set status = 'cancelado', cancel_reason = 'aula_cancelada'
   where session_id = p_session and status in ('reservado', 'pre_reserva');
  get diagnostics n = row_count;
  delete from waitlist where session_id = p_session;
  return jsonb_build_object('result', 'cancelada', 'cancelled_bookings', n);
end $$;


-- =====================================================================
-- Agenda do aluno: datas especiais da semana
-- =====================================================================
create or replace function get_special_days(p_box uuid, p_days int default 7)
returns table (day date, kind text, title text, note text)
language plpgsql stable security definer set search_path = public as $$
declare bx boxes; v_today date;
begin
  select * into bx from boxes where id = p_box;
  if bx.id is null then raise exception 'BOX_NAO_ENCONTRADO'; end if;
  if not is_trusted_caller() then
    if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
    if not is_member(p_box) then raise exception 'SEM_PERMISSAO'; end if;
  end if;
  v_today := (now() at time zone bx.timezone)::date;
  return query
  select sd.day, sd.kind, sd.title, sd.note from special_days sd
   where sd.box_id = p_box and sd.day >= v_today
     and sd.day < v_today + greatest(least(coalesce(p_days, 7), 60), 1)
   order by sd.day;
end $$;


-- =====================================================================
-- get_agenda / staff_sessions: mesmas de 20261120 e 20261124, com LEFT JOIN na grade
-- (aula avulsa não tem slot) e os dados da aula avulsa vindos da própria linha.
-- =====================================================================
create or replace function get_agenda(p_box uuid, p_days int default 7)
returns table (
  session_id        uuid,
  starts_at         timestamptz,
  day               date,
  start_time        text,
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
  my_waitlist_pos   int
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
    coalesce(s.duration_min, sl.duration_min),
    m.code,
    m.name,
    m.color,
    coalesce(s.label, sl.label),
    coalesce(s.level, sl.level),
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
  left join schedule_slots sl on sl.id = s.slot_id
  left join modalities m on m.id = coalesce(s.modality_id, sl.modality_id)
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

create or replace function staff_sessions(p_box uuid, p_days int default 7, p_all boolean default false)
returns table (
  session_id     uuid,
  starts_at      timestamptz,
  day            date,
  start_time     text,
  duration_min   int,
  modality_name  text,
  modality_color text,
  label          text,
  level          class_level,
  coach_name     text,
  is_mine        boolean,
  capacity       int,
  booked_count   int,
  waitlist_count int,
  cancelled      boolean,
  closed         boolean,
  roster         jsonb
)
language plpgsql security definer set search_path = public as $$
declare bx boxes; v_me uuid; v_today date; v_days int := greatest(least(coalesce(p_days, 7), 14), 1);
begin
  perform _assert_staff(p_box);
  select * into bx from boxes where id = p_box;
  v_me := caller_person(p_box);
  perform ensure_sessions(p_box, v_days + 1);
  v_today := (now() at time zone bx.timezone)::date;

  return query
  select
    s.id,
    s.starts_at,
    (s.starts_at at time zone bx.timezone)::date,
    to_char(s.starts_at at time zone bx.timezone, 'HH24:MI'),
    coalesce(s.duration_min, sl.duration_min),
    m.name,
    m.color,
    coalesce(s.label, sl.label),
    coalesce(s.level, sl.level),
    c.name,
    coalesce(coalesce(s.coach_override, sl.coach_id) = v_me, false),
    coalesce(s.capacity_override, sl.capacity),
    s.booked_count,
    s.waitlist_count,
    s.cancelled,
    s.closed_at is not null,
    (select coalesce(jsonb_agg(jsonb_build_object(
              'person_id', p.id,
              'name', p.name,
              'role', p.role,
              'type', b.type,
              'status', b.status,
              'birthday_today', coalesce(is_birthday(p.birth_date, (s.starts_at at time zone bx.timezone)::date), false),
              'health_attention', coalesce(hf.needs_attention, false),
              'has_health_form', hf.person_id is not null,
              'first_class', not exists (
                 select 1 from bookings b2 join class_sessions s2 on s2.id = b2.session_id
                  where b2.person_id = p.id and b2.status = 'presente' and s2.starts_at < s.starts_at))
            order by (b.type = 'experimental') desc, p.name), '[]'::jsonb)
       from bookings b
       join people p on p.id = b.person_id
       left join health_forms hf on hf.person_id = p.id
      where b.session_id = s.id and b.status::text in ('reservado', 'presente', 'pre_reserva', 'falta', 'abonada'))
  from class_sessions s
  left join schedule_slots sl on sl.id = s.slot_id
  left join modalities m on m.id = coalesce(s.modality_id, sl.modality_id)
  left join people c on c.id = coalesce(s.coach_override, sl.coach_id)
  where s.box_id = p_box
    and s.starts_at >= v_today::timestamp at time zone bx.timezone
    and s.starts_at <  (v_today + v_days)::timestamp at time zone bx.timezone
    and (p_all or coalesce(s.coach_override, sl.coach_id) = v_me)
  order by s.starts_at;
end $$;

-- Presença por aula (dashboard): aulas avulsas também contam
create or replace view v_attendance as
select s.box_id, s.starts_at::date as day, extract(isodow from s.starts_at) as weekday,
       to_char(s.starts_at, 'HH24:MI') as hour, coalesce(s.coach_override, sl.coach_id) as coach_id,
       count(*) filter (where b.status in ('reservado','presente','falta','cancelado')) as booked,
       count(*) filter (where b.status = 'presente') as present,
       count(*) filter (where b.status = 'cancelado') as cancelled_in_time,
       count(*) filter (where b.status = 'falta') as no_show
from class_sessions s left join schedule_slots sl on sl.id = s.slot_id
left join bookings b on b.session_id = s.id
where s.closed_at is not null
group by 1,2,3,4,5;


-- ---------- permissões ----------
revoke execute on function _holiday_cancel_day(uuid, date, text), _holiday_reopen_day(uuid, date)
  from public, anon, authenticated;

revoke execute on function
  admin_special_days(uuid, int), admin_set_special_day(uuid, date, text, text, text),
  admin_remove_special_day(uuid, date),
  admin_create_special_session(uuid, date, time, text, int, int, uuid, uuid, class_level),
  admin_cancel_special_session(uuid, text), get_special_days(uuid, int),
  get_agenda(uuid, int), staff_sessions(uuid, int, boolean)
from public, anon;
grant execute on function
  admin_special_days(uuid, int), admin_set_special_day(uuid, date, text, text, text),
  admin_remove_special_day(uuid, date),
  admin_create_special_session(uuid, date, time, text, int, int, uuid, uuid, class_level),
  admin_cancel_special_session(uuid, text), get_special_days(uuid, int),
  get_agenda(uuid, int), staff_sessions(uuid, int, boolean)
to authenticated, service_role;
