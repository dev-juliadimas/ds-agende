-- =====================================================================
-- Aula experimental: até 5 alunos por turma (padrão)
--
-- 1. schedule_slots.trial_quota passa a ter padrão 5 (era 2). Horários que ainda estavam
--    no padrão antigo (2) sobem para 5; quem já tinha ajustado outro número fica como está.
-- 2. Aulas especiais (class_sessions sem slot_id, criadas em Datas Especiais) não tinham
--    cota nem checagem de nível para experimental: agora valem o padrão de 5 e o nível
--    da própria aula.
--
-- Depende de: 20261203_auditoria_seguranca.sql (_book_class com trava por aluno).
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table schedule_slots alter column trial_quota set default 5;
update schedule_slots set trial_quota = 5 where trial_quota = 2;

create or replace function _book_class(p_session uuid, p_person uuid, p_type booking_type, p_source channel, p_hold boolean default false)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; cap int; taken int; trials int; p people; result bookings;
begin
  select * into s from class_sessions where id = p_session for update;
  select * into sl from schedule_slots where id = s.slot_id;
  select * into bx from boxes where id = s.box_id;
  select * into p from people where id = p_person for update;   -- serializa reservas do mesmo aluno (limite semanal)
  if s.cancelled or s.closed_at is not null or s.starts_at < now() - interval '15 minutes' then
    raise exception 'AULA_ENCERRADA';
  end if;
  if p_type <> 'recorrente'
     and (s.starts_at at time zone bx.timezone)::date - (now() at time zone bx.timezone)::date > bx.book_ahead_days then
    raise exception 'AGENDA_FECHADA';
  end if;
  perform _assert_plan_active(p, p_type);
  perform _assert_plan_rules(p, s, sl, bx, p_type);

  cap := coalesce(s.capacity_override, sl.capacity);
  select count(*), count(*) filter (where type = 'experimental') into taken, trials
    from bookings where session_id = p_session and status in ('reservado','presente','pre_reserva');
  if p_type in ('experimental','dropin','extra') then
    if sl.sales_block = 'blocked' then raise exception 'VENDA_BLOQUEADA'; end if;
    if sl.sales_block = 'auto' and exists (select 1 from boxes b where b.id = s.box_id and b.sales_mode = 'auto'
         and taken * 100 >= b.sales_max_pct * cap) then
      raise exception 'VENDA_BLOQUEADA';
    end if;
  end if;
  if p_type = 'experimental' then
    -- aula especial (sem slot): nível da própria aula e cota padrão de 5
    if coalesce(s.level, sl.level, 'misto') not in ('iniciante','misto') then raise exception 'NIVEL_INCOMPATIVEL'; end if;
    if trials >= coalesce(sl.trial_quota, 5) then raise exception 'COTA_EXPERIMENTAL'; end if;
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
revoke execute on function _book_class(uuid, uuid, booking_type, channel, boolean) from public, anon, authenticated;

-- Conferência: cota por horário
select b.name as box, s.weekday, s.start_time, s.trial_quota
  from schedule_slots s join boxes b on b.id = s.box_id
 where s.active
 order by b.name, s.weekday, s.start_time;
