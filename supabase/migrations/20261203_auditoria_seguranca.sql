-- =====================================================================
-- Auditoria pré-produção (19/11/2026) — correções de segurança
-- Rode no SQL Editor DEPOIS das migrations anteriores. Pode rodar mais de uma vez.
--
-- 1. Views do dashboard (v_churn_risk / v_attendance) estavam abertas para a chave
--    pública: qualquer visitante lia nome + telefone dos alunos de todos os boxes.
--    Nenhuma tela usa as views; ficam só para SQL Editor / service_role.
-- 2. RLS ligado nas tabelas que o schema.sql criava sem RLS. Sem policy = ninguém
--    lê/escreve pela API; as RPCs (security definer) e o service_role continuam funcionando.
-- 3. book_class (RPC antiga, ainda exposta): visitante/drop-in chamava direto com
--    p_type='avulso' e reservava sem limite, pulando a regra de 1 aula experimental/avulsa.
-- 4. _book_class trava a linha do aluno: duas reservas simultâneas em aulas diferentes
--    não passam mais juntas do limite semanal do plano.
-- =====================================================================

-- ---------- 1. Views ----------
alter view if exists v_churn_risk set (security_invoker = on);
alter view if exists v_attendance set (security_invoker = on);
revoke all on v_churn_risk from anon, authenticated;
revoke all on v_attendance from anon, authenticated;

-- ---------- 2. RLS nas tabelas sem proteção ----------
do $$
declare t text;
begin
  foreach t in array array['boxes','schedule_slots','recurrences','checkin_tokens','badges',
                           'person_badges','whatsapp_outbox','bot_sessions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------- 3. book_class: fora da equipe, só aluno com plano ----------
create or replace function book_class(p_session uuid, p_person uuid, p_type booking_type, p_source channel, p_hold boolean default false)
returns bookings language plpgsql security definer set search_path = public as $$
declare v_box uuid; v_role member_role;
begin
  select box_id into v_box from class_sessions where id = p_session;
  if v_box is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  select role into v_role from people where id = p_person and box_id = v_box;
  if v_role is null then raise exception 'SEM_PERMISSAO'; end if;

  if not is_trusted_caller() then
    if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
    if not is_staff(v_box) then
      if caller_person(v_box) is distinct from p_person then raise exception 'SEM_PERMISSAO'; end if;
      if p_type <> 'avulso' or p_hold or p_source <> 'web' then raise exception 'SEM_PERMISSAO'; end if;
      -- visitante / drop-in reservam só pela app_book_class (limite de 1 aula)
      if v_role <> 'aluno' then raise exception 'SEM_PERMISSAO'; end if;
    end if;
  end if;

  return _book_class(p_session, p_person, p_type, p_source, p_hold);
end $$;

-- ---------- 4. _book_class com trava por aluno (igual a 20261130_regras_plano.sql + lock) ----------
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
    if sl.level not in ('iniciante','misto') then raise exception 'NIVEL_INCOMPATIVEL'; end if;
    if trials >= sl.trial_quota then raise exception 'COTA_EXPERIMENTAL'; end if;
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
