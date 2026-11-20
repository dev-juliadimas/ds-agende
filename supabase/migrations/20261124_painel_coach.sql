-- =====================================================================
-- Painel do coach (mesma rota /clientes/:slug/painel, visão reduzida)
--
-- Depende de: 20261120_agenda_aluno.sql (ensure_sessions), 20261122_auto_cadastro.sql
--             (health_forms.needs_attention) e 20261123_painel_admin.sql.
--
-- O coach vê:
--   • Minhas turmas   → staff_sessions(): aulas dos próximos dias em que ele é o coach
--                       (ou todas, com p_all = true), com a lista de quem vai.
--   • Aniversariantes → staff_people(): nome e dia (sem ano, sem telefone).
--   • Aula experimental → staff_people(): quem está em experimental e quando vai/foi.
-- Ficha de saúde: o coach já lê health_forms pelo RLS (is_staff).
-- NÃO vê: financeiro, telefone, interessados do formulário (isso é só do owner).
-- O owner usa as mesmas funções na aba Turmas do painel dele.
--
-- Criar um coach (rode no SQL Editor, depois que a pessoa criar a conta pelo app):
--
--   update people p set role = 'coach', plan = null, plan_id = null, due_date = null, financial_status = 'ativo'
--     from auth.users u
--    where u.id = p.auth_user_id and u.email = 'EMAIL_DO_COACH'
--      and p.box_id = (select id from boxes where slug = 'icara-training-club');
--
-- Ligar o coach aos horários dele na grade (ex.: CROSS de seg a sex às 06:00 e 07:00):
--
--   update schedule_slots s set coach_id = p.id
--     from people p join auth.users u on u.id = p.auth_user_id
--    where u.email = 'EMAIL_DO_COACH' and p.box_id = s.box_id
--      and s.box_id = (select id from boxes where slug = 'icara-training-club')
--      and s.weekday between 1 and 5 and s.start_time in ('06:00', '07:00');
--
-- Pode rodar mais de uma vez.
-- =====================================================================

create or replace function _assert_staff(p_box uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if is_trusted_caller() then return; end if;
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  if not is_staff(p_box) then raise exception 'SEM_PERMISSAO'; end if;
end $$;

create index if not exists schedule_slots_coach_idx on schedule_slots (coach_id);


-- ---------- turmas com a lista de alunos ----------
-- p_all = false: só as aulas em que quem chama é o coach (grade ou troca da data).
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
  roster         jsonb       -- [{ person_id, name, role, type, status, birthday_today, health_attention, has_health_form, first_class }]
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
    sl.duration_min,
    m.name,
    m.color,
    sl.label,
    sl.level,
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
      -- ::text: o status 'abonada' existe no schema.sql mas pode faltar em bancos criados antes dele
      where b.session_id = s.id and b.status::text in ('reservado', 'presente', 'pre_reserva', 'falta', 'abonada'))
  from class_sessions s
  join schedule_slots sl on sl.id = s.slot_id
  left join modalities m on m.id = sl.modality_id
  left join people c on c.id = coalesce(s.coach_override, sl.coach_id)
  where s.box_id = p_box
    and s.starts_at >= v_today::timestamp at time zone bx.timezone
    and s.starts_at <  (v_today + v_days)::timestamp at time zone bx.timezone
    and (p_all or coalesce(s.coach_override, sl.coach_id) = v_me)
  order by s.starts_at;
end $$;


-- ---------- pessoas, só o que o coach precisa ----------
-- Sem telefone, sem ano de nascimento, sem financeiro.
create or replace function staff_people(p_box uuid)
returns table (
  person_id         uuid,
  name              text,
  role              member_role,
  is_test           boolean,
  birth_day         int,
  birth_month       int,
  birthday_today    boolean,
  health_attention  boolean,
  has_health_form   boolean,
  trial_done        boolean,
  last_class_at     timestamptz,
  last_class_status booking_status,
  next_class_at     timestamptz,
  created_at        timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare bx boxes; v_today date;
begin
  perform _assert_staff(p_box);
  select * into bx from boxes where id = p_box;
  v_today := (now() at time zone bx.timezone)::date;

  return query
  select
    p.id, p.name, p.role, p.is_test,
    extract(day from p.birth_date)::int,
    extract(month from p.birth_date)::int,
    coalesce(is_birthday(p.birth_date, v_today), false),
    coalesce(hf.needs_attention, false),
    hf.person_id is not null,
    exists (select 1 from bookings b where b.person_id = p.id and b.type = 'experimental' and b.status in ('presente', 'falta')),
    lb.starts_at, lb.status,
    (select min(s.starts_at) from bookings b join class_sessions s on s.id = b.session_id
      where b.person_id = p.id and b.status in ('reservado', 'pre_reserva') and s.starts_at > now()),
    p.created_at
  from people p
  left join health_forms hf on hf.person_id = p.id
  left join lateral (
    select s.starts_at, b.status from bookings b join class_sessions s on s.id = b.session_id
     where b.person_id = p.id and b.status not in ('cancelado', 'expirado') and s.starts_at <= now()
     order by s.starts_at desc limit 1
  ) lb on true
  where p.box_id = p_box
  order by p.name;
end $$;


-- ---------- permissões ----------
revoke execute on function _assert_staff(uuid) from public, anon, authenticated;

revoke execute on function staff_sessions(uuid, int, boolean), staff_people(uuid) from public, anon;
grant  execute on function staff_sessions(uuid, int, boolean), staff_people(uuid) to authenticated, service_role;
