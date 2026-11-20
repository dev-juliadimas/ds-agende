-- =====================================================================
-- Coach responsável por aula + troca de aulas entre coaches
--
-- Quem dá cada aula:
--   • schedule_slots.coach_id     → coach FIXO da turma (toda semana). Só o administrador define.
--   • class_sessions.coach_override → coach só daquela DATA (troca pontual).
--   Coach da aula = coalesce(coach_override, coach_id).
--
-- Troca entre coaches (coach_swaps):
--   1. O coach da aula pede a troca para outro coach e escolhe o alcance:
--        'aula'  → só aquela data   |   'turma' → a turma fixa, toda semana
--   2. A aula só muda quando o outro coach ACEITA. Quem pediu pode cancelar enquanto pendente.
--   3. O administrador vê todas as trocas e pode trocar o coach direto, sem pedido.
--   Uma aula nunca fica sem coach por troca: a troca sempre tem um destino.
--
-- Depende de: 20261130_feriados_aulas_especiais.sql (staff_sessions), 20261130_super_admin.sql
-- (is_staff / is_owner / caller_person). Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- pedidos de troca ----------
create table if not exists coach_swaps (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid not null references boxes(id) on delete cascade,
  scope       text not null check (scope in ('aula', 'turma')),
  session_id  uuid not null references class_sessions(id) on delete cascade, -- aula onde o pedido foi feito
  slot_id     uuid references schedule_slots(id) on delete cascade,          -- turma fixa (scope 'turma')
  from_coach  uuid not null references people(id) on delete cascade,
  to_coach    uuid not null references people(id) on delete cascade,
  note        text check (length(note) <= 300),
  status      text not null default 'pendente' check (status in ('pendente', 'aceita', 'recusada', 'cancelada')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists coach_swaps_box_idx on coach_swaps (box_id, status);
create unique index if not exists coach_swaps_one_pending_aula
  on coach_swaps (session_id) where status = 'pendente' and scope = 'aula';
create unique index if not exists coach_swaps_one_pending_turma
  on coach_swaps (slot_id) where status = 'pendente' and scope = 'turma';

alter table coach_swaps enable row level security;
-- leitura: os dois coaches envolvidos e o administrador. Escrita só pelas RPCs.
drop policy if exists coach_swaps_read on coach_swaps;
create policy coach_swaps_read on coach_swaps for select to authenticated using (
  is_owner(box_id) or from_coach = caller_person(box_id) or to_coach = caller_person(box_id)
);
revoke all on coach_swaps from anon, authenticated;
grant select on coach_swaps to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'coach_swaps') then
    alter publication supabase_realtime add table coach_swaps;
  end if;
end $$;

-- ---------- helpers ----------
-- coach/owner do box (destino válido de uma aula)
create or replace function _is_box_coach(p_box uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where id = p_person and box_id = p_box and role in ('coach', 'owner'))
$$;
revoke execute on function _is_box_coach(uuid, uuid) from public, anon, authenticated;

-- ---------- equipe que pode dar aula (seletores) ----------
create or replace function staff_coaches(p_box uuid)
returns table (person_id uuid, name text, role member_role)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_staff(p_box);
  return query
  select p.id, p.name, p.role from people p
   where p.box_id = p_box and p.role in ('coach', 'owner') and not coalesce(p.is_test, false)
   order by (p.role = 'owner'), p.name;
end $$;

-- ---------- administrador: coach fixo da turma e coach de uma data ----------
create or replace function admin_set_slot_coach(p_slot uuid, p_coach uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_box uuid;
begin
  select box_id into v_box from schedule_slots where id = p_slot;
  if v_box is null then raise exception 'TURMA_NAO_ENCONTRADA'; end if;
  perform _assert_owner(v_box);
  if p_coach is null or not _is_box_coach(v_box, p_coach) then raise exception 'COACH_INVALIDO'; end if;
  update schedule_slots set coach_id = p_coach where id = p_slot;
  -- datas futuras que estavam "trocadas" para esse mesmo coach voltam a seguir a turma
  update class_sessions set coach_override = null
   where slot_id = p_slot and coach_override = p_coach and starts_at > now();
  -- pedidos pendentes desta turma perdem o sentido
  update coach_swaps set status = 'cancelada', decided_at = now()
   where slot_id = p_slot and scope = 'turma' and status = 'pendente';
end $$;

-- p_coach null = a data volta a seguir o coach fixo da turma
create or replace function admin_set_session_coach(p_session uuid, p_coach uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_fixed uuid;
begin
  select * into s from class_sessions where id = p_session;
  if s.id is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  perform _assert_owner(s.box_id);
  select coach_id into v_fixed from schedule_slots where id = s.slot_id;
  if p_coach is not null and not _is_box_coach(s.box_id, p_coach) then raise exception 'COACH_INVALIDO'; end if;
  if p_coach is null and v_fixed is null then raise exception 'AULA_SEM_COACH'; end if;
  update class_sessions set coach_override = case when p_coach = v_fixed then null else p_coach end
   where id = p_session;
  update coach_swaps set status = 'cancelada', decided_at = now()
   where session_id = p_session and scope = 'aula' and status = 'pendente';
end $$;

-- ---------- coach: pedir, responder e cancelar troca ----------
create or replace function coach_request_swap(p_session uuid, p_to uuid, p_scope text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_fixed uuid; v_me uuid; v_current uuid; v_id uuid;
begin
  select * into s from class_sessions where id = p_session;
  if s.id is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  perform _assert_staff(s.box_id);
  v_me := caller_person(s.box_id);
  select coach_id into v_fixed from schedule_slots where id = s.slot_id;
  v_current := coalesce(s.coach_override, v_fixed);

  if p_scope not in ('aula', 'turma') then raise exception 'ALCANCE_INVALIDO'; end if;
  if s.cancelled or s.starts_at <= now() then raise exception 'AULA_ENCERRADA'; end if;
  if p_to is null or p_to = v_me or not _is_box_coach(s.box_id, p_to) then raise exception 'COACH_INVALIDO'; end if;

  if p_scope = 'aula' then
    if v_current is distinct from v_me then raise exception 'NAO_E_SUA_AULA'; end if;
    if exists (select 1 from coach_swaps where session_id = p_session and scope = 'aula' and status = 'pendente') then
      raise exception 'TROCA_JA_PEDIDA';
    end if;
  else
    if s.slot_id is null then raise exception 'AULA_SEM_TURMA_FIXA'; end if;
    if v_fixed is distinct from v_me then raise exception 'NAO_E_SUA_TURMA'; end if;
    if exists (select 1 from coach_swaps where slot_id = s.slot_id and scope = 'turma' and status = 'pendente') then
      raise exception 'TROCA_JA_PEDIDA';
    end if;
  end if;

  insert into coach_swaps (box_id, scope, session_id, slot_id, from_coach, to_coach, note)
  values (s.box_id, p_scope, p_session, case when p_scope = 'turma' then s.slot_id end, v_me, p_to,
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function coach_respond_swap(p_swap uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare w coach_swaps; s class_sessions; v_fixed uuid;
begin
  select * into w from coach_swaps where id = p_swap for update;
  if w.id is null then raise exception 'TROCA_NAO_ENCONTRADA'; end if;
  if w.to_coach is distinct from caller_person(w.box_id) then raise exception 'SEM_PERMISSAO'; end if;
  if w.status <> 'pendente' then raise exception 'TROCA_JA_RESPONDIDA'; end if;

  if not coalesce(p_accept, false) then
    update coach_swaps set status = 'recusada', decided_at = now() where id = p_swap;
    return 'recusada';
  end if;

  select * into s from class_sessions where id = w.session_id for update;
  select coach_id into v_fixed from schedule_slots where id = coalesce(w.slot_id, s.slot_id) for update;

  if w.scope = 'aula' then
    if s.cancelled or s.starts_at <= now() then raise exception 'AULA_ENCERRADA'; end if;
    -- quem pediu ainda precisa ser o coach da aula (o admin pode ter mudado no meio)
    if coalesce(s.coach_override, v_fixed) is distinct from w.from_coach then raise exception 'TROCA_DESATUALIZADA'; end if;
    update class_sessions set coach_override = case when w.to_coach = v_fixed then null else w.to_coach end
     where id = s.id;
  else
    if v_fixed is distinct from w.from_coach then raise exception 'TROCA_DESATUALIZADA'; end if;
    update schedule_slots set coach_id = w.to_coach where id = w.slot_id;
    update class_sessions set coach_override = null
     where slot_id = w.slot_id and coach_override = w.to_coach and starts_at > now();
  end if;

  update coach_swaps set status = 'aceita', decided_at = now() where id = p_swap;
  return 'aceita';
end $$;

create or replace function coach_cancel_swap(p_swap uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w coach_swaps;
begin
  select * into w from coach_swaps where id = p_swap for update;
  if w.id is null then raise exception 'TROCA_NAO_ENCONTRADA'; end if;
  if not (w.from_coach = caller_person(w.box_id) or is_owner(w.box_id)) then raise exception 'SEM_PERMISSAO'; end if;
  if w.status <> 'pendente' then raise exception 'TROCA_JA_RESPONDIDA'; end if;
  update coach_swaps set status = 'cancelada', decided_at = now() where id = p_swap;
end $$;

-- ---------- lista de trocas (painel) ----------
-- Coach: as que envolvem ele. Administrador: todas do box. Pendentes + últimos 30 dias.
-- expired = pendente de uma aula que já começou (não dá mais para aceitar).
create or replace function my_coach_swaps(p_box uuid)
returns table (
  swap_id uuid, scope text, status text, expired boolean, note text, created_at timestamptz,
  session_id uuid, starts_at timestamptz, start_time text, weekday int, class_name text,
  from_coach uuid, from_name text, to_coach uuid, to_name text, incoming boolean, outgoing boolean
)
language plpgsql stable security definer set search_path = public as $$
declare bx boxes; v_me uuid;
begin
  perform _assert_staff(p_box);
  select * into bx from boxes where id = p_box;
  v_me := caller_person(p_box);
  return query
  select w.id, w.scope, w.status, (w.status = 'pendente' and s.starts_at <= now()), w.note, w.created_at,
         s.id, s.starts_at, to_char(s.starts_at at time zone bx.timezone, 'HH24:MI'),
         extract(dow from s.starts_at at time zone bx.timezone)::int,
         coalesce(s.label, sl.label, m.name, 'Aula'),
         w.from_coach, fc.name, w.to_coach, tc.name,
         w.to_coach = v_me, w.from_coach = v_me
    from coach_swaps w
    join class_sessions s on s.id = w.session_id
    left join schedule_slots sl on sl.id = s.slot_id
    left join modalities m on m.id = coalesce(s.modality_id, sl.modality_id)
    join people fc on fc.id = w.from_coach
    join people tc on tc.id = w.to_coach
   where w.box_id = p_box
     and (is_owner(p_box) or w.from_coach = v_me or w.to_coach = v_me)
     and (w.status = 'pendente' or w.created_at > now() - interval '30 days')
   order by (w.status = 'pendente' and s.starts_at > now()) desc, s.starts_at;
end $$;

-- ---------- staff_sessions com dados do coach e da troca pendente ----------
drop function if exists staff_sessions(uuid, int, boolean);
create function staff_sessions(p_box uuid, p_days int default 7, p_all boolean default false)
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
  roster         jsonb,
  slot_id        uuid,
  coach_id       uuid,     -- coach desta data
  fixed_coach_id uuid,     -- coach fixo da turma (null em aula especial)
  fixed_coach_name text,
  is_fixed_mine  boolean,  -- quem está logado é o coach fixo da turma
  pending_swap   jsonb     -- troca pendente desta aula ou desta turma: {id, scope, from, to, to_name, from_name}
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
      where b.session_id = s.id and b.status::text in ('reservado', 'presente', 'pre_reserva', 'falta', 'abonada')),
    s.slot_id,
    coalesce(s.coach_override, sl.coach_id),
    sl.coach_id,
    fx.name,
    coalesce(sl.coach_id = v_me, false),
    (select jsonb_build_object('id', w.id, 'scope', w.scope, 'from', w.from_coach, 'to', w.to_coach,
                               'from_name', wf.name, 'to_name', wt.name)
       from coach_swaps w join people wf on wf.id = w.from_coach join people wt on wt.id = w.to_coach
      where w.status = 'pendente'
        and ((w.scope = 'aula' and w.session_id = s.id) or (w.scope = 'turma' and w.slot_id = s.slot_id))
      order by w.created_at limit 1)
  from class_sessions s
  left join schedule_slots sl on sl.id = s.slot_id
  left join modalities m on m.id = coalesce(s.modality_id, sl.modality_id)
  left join people c on c.id = coalesce(s.coach_override, sl.coach_id)
  left join people fx on fx.id = sl.coach_id
  where s.box_id = p_box
    and s.starts_at >= v_today::timestamp at time zone bx.timezone
    and s.starts_at <  (v_today + v_days)::timestamp at time zone bx.timezone
    and (p_all or coalesce(s.coach_override, sl.coach_id) = v_me)
  order by s.starts_at;
end $$;

-- ---------- permissões ----------
revoke execute on function
  staff_coaches(uuid), admin_set_slot_coach(uuid, uuid), admin_set_session_coach(uuid, uuid),
  coach_request_swap(uuid, uuid, text, text), coach_respond_swap(uuid, boolean), coach_cancel_swap(uuid),
  my_coach_swaps(uuid), staff_sessions(uuid, int, boolean)
from public, anon;
grant execute on function
  staff_coaches(uuid), admin_set_slot_coach(uuid, uuid), admin_set_session_coach(uuid, uuid),
  coach_request_swap(uuid, uuid, text, text), coach_respond_swap(uuid, boolean), coach_cancel_swap(uuid),
  my_coach_swaps(uuid), staff_sessions(uuid, int, boolean)
to authenticated, service_role;

-- ---------- conferência: turmas da grade ainda sem coach fixo ----------
select b.name as box, s.weekday, s.start_time, coalesce(s.label, m.name) as turma
  from schedule_slots s join boxes b on b.id = s.box_id left join modalities m on m.id = s.modality_id
 where s.active and s.coach_id is null
 order by b.name, s.weekday, s.start_time;
