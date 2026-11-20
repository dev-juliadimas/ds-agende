-- =====================================================================
-- Trava de agendamento: só reserva quem tem plano ativo (ou está na carência)
--
-- Depende de: schema.sql, 20261118_lock_rpcs.sql, 20261120_agenda_aluno.sql
--             e 20261122_auto_cadastro.sql (financial_status, plan_id, _weekly_limit).
--
-- Situação do plano — plan_status(pessoa):
--   'ativo'     mensalidade em dia (billing_status = 'pago')
--   'carencia'  vencida, ainda dentro de boxes.grace_days        → PODE reservar
--   'pendente'  recém-cadastrado aguardando a 1ª baixa/pagamento  → NÃO pode
--               (financial_status = 'aguardando_pagamento')
--   'bloqueado' inadimplente: carência esgotada ou blocked_at      → NÃO pode
--   'sem_plano' aluno sem plano no cadastro                        → NÃO pode
--   Coach/owner: sempre 'ativo'. Visitante/drop-in não têm mensalidade: 'sem_plano',
--   mas reservam pelos tipos 'experimental'/'dropin' (exceção abaixo).
--
-- billing_status() continua igual ('pago' | 'carencia' | 'bloqueado'): o Painel do
-- administrador e o job enforce_billing() dependem desses valores.
--
-- Onde a trava vale (uma regra só, _assert_plan_active):
--   _book_class   → núcleo usado por book_class (bot do WhatsApp / coach), app_book_class
--                   (app), create_charge, promote_waitlist e materialize_recurrence.
--   app_book_class → também no caminho da lista de espera, ANTES de olhar as vagas.
-- Exceção: reserva do tipo 'experimental' ou 'dropin' (aula avulsa — no create_charge ela
-- fica em pré-reserva até o Pix/Cartão cair, ou marcada pay_pending na recepção).
-- 'extra' (treino a mais do aluno) exige plano ativo.
--
-- Erro: raise exception 'PLANO_INATIVO: <mensagem>'. O app mostra a mensagem depois do
-- ':' no Toast (src/lib/api/errors.js); o bot pode fazer o mesmo.
-- Substitui o antigo 'ACESSO_BLOQUEADO' nessas funções.
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------- situação do plano ----------
create or replace function plan_status(p_person uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.role in ('owner', 'coach') then 'ativo'
    when p.role <> 'aluno' then 'sem_plano'
    when p.blocked_at is not null then 'bloqueado'
    when p.financial_status = 'aguardando_pagamento' then
      -- recém-cadastrado que deixou passar a carência sem pagar também vira bloqueado
      case when billing_status(p.id) = 'bloqueado' then 'bloqueado' else 'pendente' end
    when p.plan is null and p.plan_id is null then 'sem_plano'
    when billing_status(p.id) = 'pago' then 'ativo'
    else billing_status(p.id)            -- 'carencia' | 'bloqueado'
  end
  from people p where p.id = p_person
$$;

-- Aborta a reserva quando o aluno não tem plano liberado.
create or replace function _assert_plan_active(p people, p_type booking_type)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_status text;
begin
  if p.id is null then raise exception 'SEM_PERMISSAO'; end if;
  if p.role <> 'aluno' or p_type in ('experimental', 'dropin') then return; end if;
  v_status := plan_status(p.id);
  if v_status in ('ativo', 'carencia') then return; end if;
  raise exception 'PLANO_INATIVO: %', case v_status
    when 'pendente'  then 'Seu plano ainda está aguardando o pagamento. Regularize para liberar seus agendamentos.'
    when 'bloqueado' then 'Seu plano está suspenso por mensalidade em atraso. Regularize para voltar a agendar.'
    else 'Você precisa de um plano ativo para agendar aulas.' end
    using detail = v_status;
end $$;


-- =====================================================================
-- _book_class: mesma função de 20261122_auto_cadastro.sql, com a trava logo no
-- começo (antes de vagas, cota experimental e venda avulsa).
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
    select count(*) into weekly from bookings b join class_sessions cs on cs.id = b.session_id
      where b.person_id = p_person and b.status in ('reservado','presente','pre_reserva') and b.type <> 'extra'
        and date_trunc('week', cs.starts_at) = date_trunc('week', s.starts_at);
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
-- app_book_class: mesma função de 20261122_auto_cadastro.sql, com a trava antes
-- de olhar as vagas — vale para "Reservar vaga" e para "Entrar na fila".
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
    select count(*) into weekly from bookings b join class_sessions cs on cs.id = b.session_id
     where b.person_id = p_person and b.status in ('reservado','presente','pre_reserva') and b.type <> 'extra'
       and date_trunc('week', cs.starts_at) = date_trunc('week', s.starts_at);
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


-- =====================================================================
-- Para a tela da Agenda: situação do plano de quem está logado
-- =====================================================================
-- can_book = pode usar "Reservar vaga" / "Entrar na fila" (visitante e drop-in: sim, as
-- regras deles ficam no app_book_class). grace_left = dias de carência que restam.
create or replace function my_plan_status(p_box uuid)
returns table (status text, can_book boolean, due_date date, grace_left int, plan_name text, pending_amount numeric)
language sql stable security definer set search_path = public as $$
  select st.s,
         p.role <> 'aluno' or st.s in ('ativo', 'carencia'),
         p.due_date,
         case when st.s = 'carencia' then greatest(b.grace_days - ((now() at time zone b.timezone)::date - p.due_date), 0) end,
         pl.name,
         (select y.amount from payments y where y.person_id = p.id and y.status = 'pendente' order by y.created_at desc limit 1)
    from people p
    join boxes b on b.id = p.box_id
    left join plans pl on pl.id = p.plan_id
    cross join lateral (select plan_status(p.id) as s) st
   where p.box_id = p_box and p.auth_user_id = auth.uid()
   limit 1
$$;

-- Login de teste: a etiqueta passa a mostrar a situação do plano (inclui 'pendente')
create or replace function list_test_people(p_box uuid)
returns table (id uuid, name text, role member_role, plan plan_kind, billing text, phone_hint text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.plan, plan_status(p.id), '•••• ' || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
    from people p join boxes b on b.id = p.box_id
   where p.box_id = p_box and p.is_test and b.test_login_enabled
   order by p.role, p.name
$$;


-- ---------- permissões ----------
revoke execute on function plan_status(uuid), _assert_plan_active(people, booking_type) from public, anon, authenticated;
revoke execute on function my_plan_status(uuid) from public, anon;
grant  execute on function my_plan_status(uuid) to authenticated, service_role;


-- ---------- aluno de teste recém-cadastrado (aguardando pagamento) ----------
do $$
declare v_box uuid;
begin
  select id into v_box from boxes where slug = 'icara-training-club';
  if v_box is null then return; end if;
  insert into people (box_id, name, phone, role, plan, due_date, financial_status, is_test)
  values (v_box, 'Elisa Teste (pendente)', '+5548900000005', 'aluno', '3x', current_date, 'aguardando_pagamento', true)
  on conflict (box_id, phone, name) do update
    set role = excluded.role, plan = excluded.plan, due_date = excluded.due_date,
        financial_status = excluded.financial_status, is_test = true;
end $$;
