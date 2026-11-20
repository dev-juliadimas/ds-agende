-- =====================================================================
-- Cancelamento tardio (late_cancel)
--
-- Depende de: schema.sql, 20261118_lock_rpcs.sql, 20261120_agenda_aluno.sql,
--             20261122_auto_cadastro.sql e 20261129_trava_plano_ativo.sql.
--
-- Regra: o prazo é boxes.min_cancel_minutes (padrão 120 min = 2h, Painel Coach →
-- Capacidade). Antes, cancelar dentro do prazo dava erro FORA_DO_PRAZO. Agora:
--   • fora do prazo (com antecedência) → status 'cancelado', não conta no limite semanal;
--   • dentro do prazo                  → status 'late_cancel': a vaga é liberada para
--     a lista de espera, mas a reserva CONTINUA contando no limite semanal do aluno;
--   • aula já começou                  → erro AULA_ENCERRADA (vira falta, não cancelamento);
--   • p_force (coach / inadimplência)  → sempre 'cancelado', sem consumir crédito.
--
-- O limite semanal passa a ser calculado num lugar só: _weekly_used().
--
-- Rodar inteiro de uma vez (o "add value" do enum precisa vir antes das funções;
-- elas só usam o valor novo em tempo de execução). Pode rodar mais de uma vez.
-- =====================================================================

alter type booking_status add value if not exists 'late_cancel';


-- ---------- reservas que contam no limite semanal ----------
-- plpgsql (e não sql) de propósito: o corpo só é resolvido na execução, então pode
-- citar 'late_cancel' na mesma transação do "add value".
create or replace function _weekly_used(p_person uuid, p_starts timestamptz)
returns int language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from bookings b join class_sessions cs on cs.id = b.session_id
   where b.person_id = p_person
     and b.status in ('reservado','presente','pre_reserva','late_cancel')
     and b.type <> 'extra'
     and date_trunc('week', cs.starts_at) = date_trunc('week', p_starts);
  return n;
end $$;
revoke execute on function _weekly_used(uuid, timestamptz) from public, anon, authenticated;


-- ---------- núcleo do cancelamento ----------
-- (cancel_booking de 20261118_lock_rpcs.sql continua checando permissão e chama este)
create or replace function _cancel_booking(p_booking uuid, p_source channel, p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; s class_sessions; bx boxes; v_late boolean;
begin
  select * into b from bookings where id = p_booking for update;
  select * into s from class_sessions where id = b.session_id;
  select * into bx from boxes where id = s.box_id;
  if not p_force and s.starts_at <= now() then raise exception 'AULA_ENCERRADA'; end if;
  v_late := not p_force and s.starts_at - now() < make_interval(mins => bx.min_cancel_minutes);
  update bookings
     set status = case when v_late then 'late_cancel'::booking_status else 'cancelado'::booking_status end,
         cancelled_at = now(),
         cancelled_in_time = not v_late
   where id = p_booking;
  perform promote_waitlist(b.session_id);
end $$;
revoke execute on function _cancel_booking(uuid, channel, boolean) from public, anon, authenticated;


-- ---------- app_cancel_booking: devolve se foi cancelamento tardio ----------
-- result = 'cancelado' | 'late_cancel'
create or replace function app_cancel_booking(p_booking uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_before int; v_after int; v_status booking_status;
begin
  select session_id into v_session from bookings where id = p_booking;
  if v_session is null then raise exception 'RESERVA_NAO_ENCONTRADA'; end if;
  select booked_count into v_before from class_sessions where id = v_session;

  perform cancel_booking(p_booking, 'web', false);

  select status into v_status from bookings where id = p_booking;
  -- se a contagem de vagas não caiu, alguém da fila entrou no lugar
  select booked_count into v_after from class_sessions where id = v_session;
  return jsonb_build_object('result', v_status::text, 'promoted', coalesce(v_after >= v_before, false));
end $$;


-- =====================================================================
-- _book_class: mesma função de 20261129_trava_plano_ativo.sql, com o limite
-- semanal vindo de _weekly_used() (conta 'late_cancel').
-- =====================================================================
create or replace function _book_class(p_session uuid, p_person uuid, p_type booking_type, p_source channel, p_hold boolean default false)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; cap int; taken int; trials int; p people; weekly int; v_limit int; result bookings;
begin
  select * into s from class_sessions where id = p_session for update;
  select * into sl from schedule_slots where id = s.slot_id;
  select * into bx from boxes where id = s.box_id;
  select * into p from people where id = p_person;
  if s.cancelled or s.closed_at is not null or s.starts_at < now() - interval '15 minutes' then
    raise exception 'AULA_ENCERRADA';
  end if;
  if p_type <> 'recorrente'
     and (s.starts_at at time zone bx.timezone)::date - (now() at time zone bx.timezone)::date > bx.book_ahead_days then
    raise exception 'AGENDA_FECHADA';
  end if;
  -- plano ativo / carência (substitui o antigo ACESSO_BLOQUEADO)
  perform _assert_plan_active(p, p_type);

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
    if sl.level not in ('iniciante','misto') then raise exception 'NIVEL_INCOMPATIVEL'; end if;
    if trials >= sl.trial_quota then raise exception 'COTA_EXPERIMENTAL'; end if;
  end if;
  if taken >= cap then raise exception 'TURMA_LOTADA'; end if;
  v_limit := _weekly_limit(p);
  if p.role = 'aluno' and v_limit is not null and p_type not in ('experimental','extra') then
    weekly := _weekly_used(p_person, s.starts_at);
    if weekly >= v_limit then raise exception 'LIMITE_PLANO'; end if;
  end if;
  insert into bookings(session_id, person_id, type, source, status, hold_until)
    values (p_session, p_person, p_type, p_source,
            case when p_hold then 'pre_reserva'::booking_status else 'reservado' end,
            case when p_hold then now() + make_interval(mins => bx.hold_minutes) end)
    returning * into result;
  delete from waitlist where session_id = p_session and person_id = p_person;
  return result;
end $$;
revoke execute on function _book_class(uuid, uuid, booking_type, channel, boolean) from public, anon, authenticated;


-- =====================================================================
-- app_book_class: mesma função de 20261129_trava_plano_ativo.sql, com o limite
-- semanal vindo de _weekly_used() (vale também para "Entrar na fila").
-- =====================================================================
create or replace function app_book_class(p_session uuid, p_person uuid, p_waitlist boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; p people;
  cap int; taken int; weekly int; v_limit int; v_source channel; v_type booking_type; bk bookings; v_pos int;
begin
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

  v_type := case p.role when 'visitante' then 'experimental' when 'dropin' then 'dropin' else 'avulso' end;
  perform _assert_plan_active(p, v_type);

  if v_type <> 'avulso' and exists (
       select 1 from bookings where person_id = p_person and status in ('reservado','presente','pre_reserva','falta')) then
    raise exception '%', case when v_type = 'experimental' then 'LIMITE_EXPERIMENTAL' else 'LIMITE_AVULSA' end;
  end if;

  cap := coalesce(s.capacity_override, sl.capacity);
  select count(*) into taken from bookings
   where session_id = p_session and status in ('reservado','presente','pre_reserva');

  if taken < cap then
    v_source := case when is_trusted_caller() then 'sistema'
                     when caller_person(s.box_id) = p_person then 'web'
                     else 'coach' end;
    bk := _book_class(p_session, p_person, v_type, v_source, false);
    return jsonb_build_object('result', 'reservado', 'booking_id', bk.id);
  end if;

  if not p_waitlist or v_type <> 'avulso' then raise exception 'TURMA_LOTADA'; end if;

  if s.cancelled or s.closed_at is not null or s.starts_at <= now() then
    raise exception 'AULA_ENCERRADA';
  end if;
  if (s.starts_at at time zone bx.timezone)::date - (now() at time zone bx.timezone)::date > bx.book_ahead_days then
    raise exception 'AGENDA_FECHADA';
  end if;
  v_limit := _weekly_limit(p);
  if p.role = 'aluno' and v_limit is not null then
    weekly := _weekly_used(p_person, s.starts_at);
    if weekly >= v_limit then raise exception 'LIMITE_PLANO'; end if;
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
