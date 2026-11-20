-- =====================================================================
-- Horário Fixo: o aluno fixa uma turma da grade e o sistema reserva a vaga
-- toda semana, sozinho.
--
-- Depende de: schema.sql, 20261118_lock_rpcs.sql (is_trusted_caller, caller_person),
--             20261120_agenda_aluno.sql (ensure_sessions), 20261122_auto_cadastro.sql
--             (_weekly_limit) e 20261129_trava_plano_ativo.sql (plan_status, _book_class).
--
-- O que entra:
--   1. recurring_bookings (pessoa + turma da grade schedule_slots). Também em schema.sql.
--   2. sync_recurring_bookings(box, dias) → cria as reservas 'recorrente' dos próximos
--      dias para quem tem horário fixo. Job diário no pg_cron (depois do ensure_sessions)
--      e chamada imediata quando o aluno fixa um horário.
--      Regras da reserva automática:
--        • só com plano 'ativo' (mensalidade em dia). Carência, pendente, bloqueado ou
--          sem plano → a reserva é PULADA (o horário fixo continua salvo; volta a reservar
--          no próximo sync depois que o plano for regularizado).
--        • se o aluno já teve qualquer reserva naquela aula (inclusive cancelada por ele),
--          não reserva de novo — cancelar uma semana não é desfeito pelo job.
--        • turma lotada / limite semanal / aula cancelada → pula aquela aula e segue.
--   3. App do aluno:
--        my_recurring_bookings(box)   → lista para o Perfil e para marcar o card da Agenda
--        app_fix_slot(aula)           → fixa a turma daquela aula (e já reserva a semana)
--        app_unfix_slot(horario_fixo) → desativa (não cancela reservas já feitas)
--
-- A tabela antiga `recurrences` (dias + hora, usada por materialize_recurrence) não é
-- usada pelo app; fica como está até o bot migrar para recurring_bookings.
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------- 1. tabela ----------
create table if not exists recurring_bookings (
  id               uuid primary key default gen_random_uuid(),
  box_id           uuid not null references boxes(id) on delete cascade,
  person_id        uuid not null references people(id) on delete cascade,
  schedule_slot_id uuid not null references schedule_slots(id) on delete cascade,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (person_id, schedule_slot_id)
);
create index if not exists recurring_bookings_slot_idx on recurring_bookings (schedule_slot_id) where active;
create index if not exists recurring_bookings_box_idx  on recurring_bookings (box_id) where active;

-- Leitura: o próprio aluno e a equipe do box. Escrita só pelas RPCs abaixo.
alter table recurring_bookings enable row level security;
drop policy if exists recurring_bookings_read on recurring_bookings;
create policy recurring_bookings_read on recurring_bookings for select to authenticated
  using (person_id = caller_person(box_id) or is_staff(box_id));
revoke insert, update, delete on recurring_bookings from anon, authenticated;
grant select on recurring_bookings to authenticated;


-- ---------- 2. sincronização ----------
-- Núcleo: reserva as aulas de UM horário fixo nos próximos p_days dias. Devolve quantas criou.
create or replace function _sync_recurring_booking(p_rb uuid, p_days int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare rb recurring_bookings; cs record; n int := 0;
begin
  select r.* into rb from recurring_bookings r
    join schedule_slots sl on sl.id = r.schedule_slot_id and sl.active
   where r.id = p_rb and r.active;
  if rb.id is null then return 0; end if;

  -- só plano ativo: vencido (mesmo na carência), pendente ou bloqueado → pula
  if plan_status(rb.person_id) is distinct from 'ativo' then return 0; end if;

  for cs in
    select c.id from class_sessions c
     where c.slot_id = rb.schedule_slot_id
       and not c.cancelled and c.closed_at is null
       and c.starts_at > now()
       and c.starts_at < now() + make_interval(days => greatest(least(coalesce(p_days, 7), 14), 1))
       and not exists (select 1 from bookings b where b.session_id = c.id and b.person_id = rb.person_id)
     order by c.starts_at
  loop
    begin
      perform _book_class(cs.id, rb.person_id, 'recorrente', 'sistema');
      n := n + 1;
    exception when others then null;  -- lotada / limite do plano / encerrada: segue para a próxima
    end;
  end loop;
  return n;
end $$;

-- Todos os horários fixos (do box, ou de todos os boxes com p_box = null).
-- Chamada pelo pg_cron/service_role; a equipe do box também pode disparar pelo painel.
create or replace function sync_recurring_bookings(p_box uuid default null, p_days int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare b record; r record; n int := 0;
begin
  if not is_trusted_caller() then
    if p_box is null or not is_staff(p_box) then raise exception 'SEM_PERMISSAO'; end if;
  end if;

  for b in select id from boxes where p_box is null or id = p_box loop
    perform ensure_sessions(b.id, greatest(least(coalesce(p_days, 7), 14), 1) + 1);
  end loop;

  for r in select rb.id from recurring_bookings rb
            where rb.active and (p_box is null or rb.box_id = p_box)
            order by rb.created_at          -- quem fixou primeiro tem prioridade na vaga
  loop
    n := n + _sync_recurring_booking(r.id, p_days);
  end loop;
  return n;
end $$;

-- Job diário 00:20 em Brasília (depois do ds_ensure_sessions das 00:10)
do $$ begin
  perform cron.schedule('ds_sync_recurring_bookings', '20 3 * * *', 'select sync_recurring_bookings(null, 7)');
exception when others then
  raise notice 'pg_cron indisponível: agende sync_recurring_bookings manualmente (%).', sqlerrm;
end $$;


-- ---------- 3. app do aluno ----------
-- Horários fixos de quem está logado (ativos e desativados), com os dados da turma.
create or replace function my_recurring_bookings(p_box uuid)
returns table (
  id               uuid,
  schedule_slot_id uuid,
  active           boolean,
  weekday          smallint,      -- 0 = domingo
  start_time       text,          -- 'HH:MI'
  duration_min     int,
  label            text,
  modality_name    text,
  modality_color   text,
  coach_name       text,
  slot_active      boolean        -- false = o box tirou a turma da grade
)
language sql stable security definer set search_path = public as $$
  select rb.id, rb.schedule_slot_id, rb.active, sl.weekday, to_char(sl.start_time, 'HH24:MI'),
         sl.duration_min, sl.label, m.name, m.color, c.name, sl.active
    from recurring_bookings rb
    join schedule_slots sl on sl.id = rb.schedule_slot_id
    left join modalities m on m.id = sl.modality_id
    left join people c on c.id = sl.coach_id
   where rb.box_id = p_box and rb.person_id = caller_person(p_box)
   order by rb.active desc, sl.weekday, sl.start_time
$$;

-- Fixa a turma da aula p_session. Retorno: { id, booked } (booked = reservas criadas agora)
create or replace function app_fix_slot(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s class_sessions; sl schedule_slots; p people; v_me uuid; v_limit int; v_count int; v_id uuid; v_booked int;
begin
  select * into s from class_sessions where id = p_session;
  if s.id is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  v_me := caller_person(s.box_id);
  if v_me is null then raise exception 'SEM_PERMISSAO'; end if;

  select * into p from people where id = v_me;
  if p.role <> 'aluno' then raise exception 'HORARIO_FIXO_SO_ALUNO'; end if;

  select * into sl from schedule_slots where id = s.slot_id;
  if not sl.active then raise exception 'HORARIO_INATIVO'; end if;

  -- não deixa fixar mais horários do que o plano permite por semana
  v_limit := _weekly_limit(p);
  select count(*) into v_count from recurring_bookings
   where person_id = v_me and active and schedule_slot_id <> sl.id;
  if v_limit is not null and v_count >= v_limit then raise exception 'HORARIO_FIXO_LIMITE'; end if;

  insert into recurring_bookings (box_id, person_id, schedule_slot_id)
  values (s.box_id, v_me, sl.id)
  on conflict (person_id, schedule_slot_id) do update set active = true, updated_at = now()
  returning id into v_id;

  v_booked := _sync_recurring_booking(v_id, 7);
  return jsonb_build_object('id', v_id, 'booked', v_booked, 'plan_status', plan_status(v_me));
end $$;

-- Desativa um horário fixo do aluno logado. Reservas já criadas continuam (o aluno cancela na Agenda).
create or replace function app_unfix_slot(p_recurring uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rb recurring_bookings;
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  select * into rb from recurring_bookings where id = p_recurring;
  if rb.id is null or rb.person_id is distinct from caller_person(rb.box_id) then
    raise exception 'HORARIO_FIXO_NAO_ENCONTRADO';
  end if;
  update recurring_bookings set active = false, updated_at = now() where id = rb.id;
end $$;


-- ---------- permissões ----------
revoke execute on function _sync_recurring_booking(uuid, int) from public, anon, authenticated;
grant  execute on function _sync_recurring_booking(uuid, int) to service_role;

revoke execute on function sync_recurring_bookings(uuid, int) from public, anon;
grant  execute on function sync_recurring_bookings(uuid, int) to authenticated, service_role;  -- checa equipe por dentro

revoke execute on function my_recurring_bookings(uuid), app_fix_slot(uuid), app_unfix_slot(uuid) from public, anon;
grant  execute on function my_recurring_bookings(uuid), app_fix_slot(uuid), app_unfix_slot(uuid) to authenticated, service_role;
