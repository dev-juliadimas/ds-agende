-- =====================================================================
-- Regras do plano na reserva: limite semanal + modalidades liberadas
--
-- Depende de: 20261119_icara_training_club.sql (plans, plan_modalities, modalities,
--             schedule_slots.modality_id), 20261122_auto_cadastro.sql (_weekly_limit,
--             people.plan_id), 20261129_trava_plano_ativo.sql (_assert_plan_active) e
--             20261130_cancelamento_tardio.sql (status 'late_cancel', _weekly_used).
--             Rodar DEPOIS do cancelamento_tardio: esta redefine _book_class/app_book_class.
--
-- Onde ficam as regras (nenhuma coluna nova):
--   • plans.weekly_limit  → aulas por semana; null = livre.
--   • plan_modalities     → modalidades que o plano libera. Plano sem nenhuma linha
--                           = libera todas. Horário sem modalidade = qualquer plano.
--   Aluno no plano antigo (só people.plan, sem plan_id): limite pelo plan_kind e
--   todas as modalidades (como antes).
--
-- Semana = segunda a domingo NO FUSO DO BOX. Antes a conta era em UTC: uma aula de
-- domingo 21:00 (Brasília) caía na semana seguinte.
--
-- Conta como reserva válida (_weekly_used): 'reservado', 'presente', 'pre_reserva' e
-- 'late_cancel' (cancelou em cima da hora). Treino 'extra' não conta. Cancelada com
-- antecedência, falta, abonada e expirada não contam.
--
-- Valem para aluno nas reservas 'avulso' e 'recorrente' (app, bot e coach — todos
-- passam por _book_class). Ficam de fora: experimental, drop-in e treino extra.
-- No app_book_class a checagem vem ANTES das vagas: o aluno não entra na lista de
-- espera de uma aula que o plano não deixaria reservar.
--
-- Erros (o app mostra o texto depois do ':' no Toast — src/lib/api/errors.js):
--   'LIMITE_PLANO: Você já tem 3 de 3 aulas reservadas na semana de 23/11 a 29/11. …'
--   'MODALIDADE_NAO_INCLUSA: Seu plano HY-FITNESS 2x/semana · Mensal não inclui aulas de CROSS. …'
--
-- Para a tela: my_week_usage(box) → aulas usadas / limite por semana.
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------- semana no fuso do box ----------
-- Segunda-feira da semana de p_ts, no fuso p_tz.
create or replace function _week_start(p_ts timestamptz, p_tz text)
returns date language sql stable as $$
  select date_trunc('week', p_ts at time zone p_tz)::date
$$;

-- Reservas que contam no limite semanal: mesma função de 20261130_cancelamento_tardio.sql
-- (mesma assinatura, conta 'late_cancel'), agora com a semana no fuso do box.
-- plpgsql de propósito: só resolve 'late_cancel' na execução.
create or replace function _weekly_used(p_person uuid, p_starts timestamptz)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_week date; n int;
begin
  select b.timezone into v_tz from people p join boxes b on b.id = p.box_id where p.id = p_person;
  v_tz := coalesce(v_tz, 'America/Sao_Paulo');
  v_week := _week_start(p_starts, v_tz);
  select count(*) into n from bookings b join class_sessions cs on cs.id = b.session_id
   where b.person_id = p_person
     and b.status in ('reservado','presente','pre_reserva','late_cancel')
     and b.type <> 'extra'
     and cs.starts_at >= (v_week::timestamp at time zone v_tz)
     and cs.starts_at <  ((v_week + 7)::timestamp at time zone v_tz);
  return n;
end $$;

-- O plano do aluno libera a modalidade deste horário?
create or replace function _plan_allows_modality(p people, p_modality uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p.role <> 'aluno'
      or p.plan_id is null                                   -- plano antigo (plan_kind): tudo
      or p_modality is null                                  -- horário sem modalidade
      or not exists (select 1 from plan_modalities where plan_id = p.plan_id)   -- plano sem lista = tudo
      or exists (select 1 from plan_modalities where plan_id = p.plan_id and modality_id = p_modality)
$$;

-- Aborta a reserva quando a aula está fora do plano ou o limite da semana acabou.
create or replace function _assert_plan_rules(p people, s class_sessions, sl schedule_slots, bx boxes, p_type booking_type)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_limit int; v_week date; v_used int; v_plan text; v_mod text;
begin
  if p.role <> 'aluno' or p_type in ('experimental', 'dropin', 'extra') then return; end if;

  if not _plan_allows_modality(p, sl.modality_id) then
    select name into v_plan from plans where id = p.plan_id;
    select name into v_mod from modalities where id = sl.modality_id;
    raise exception 'MODALIDADE_NAO_INCLUSA: Seu plano % não inclui aulas de %. Fale com o box para trocar de plano ou adicionar a modalidade.',
      coalesce(v_plan, 'atual'), coalesce(v_mod, 'esta modalidade');
  end if;

  v_limit := _weekly_limit(p);
  if v_limit is null then return; end if;
  v_week := _week_start(s.starts_at, bx.timezone);
  v_used := _weekly_used(p.id, s.starts_at);
  if v_used >= v_limit then
    raise exception 'LIMITE_PLANO: Você já tem % de % aulas reservadas na semana de % a %. Cancele uma reserva dessa semana ou fale com o box para um treino extra.',
      v_used, v_limit, to_char(v_week, 'DD/MM'), to_char(v_week + 6, 'DD/MM')
      using detail = format('%s/%s', v_used, v_limit);
  end if;
end $$;


-- =====================================================================
-- _book_class: mesma função de 20261130_cancelamento_tardio.sql. Muda só o bloco do
-- limite semanal, trocado por _assert_plan_rules e movido para antes das vagas.
-- =====================================================================
create or replace function _book_class(p_session uuid, p_person uuid, p_type booking_type, p_source channel, p_hold boolean default false)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; cap int; taken int; trials int; p people; result bookings;
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
  -- plano ativo / carência
  perform _assert_plan_active(p, p_type);
  -- modalidade liberada + limite da semana (seg–dom no fuso do box)
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


-- =====================================================================
-- app_book_class: mesma função de 20261130_cancelamento_tardio.sql, com as regras do
-- plano antes de olhar as vagas (vale para "Reservar vaga" e "Entrar na fila").
-- =====================================================================
create or replace function app_book_class(p_session uuid, p_person uuid, p_waitlist boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; p people;
  cap int; taken int; v_source channel; v_type booking_type; bk bookings; v_pos int;
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
  perform _assert_plan_rules(p, s, sl, bx, v_type);

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
-- Para a tela da Agenda: aulas usadas na semana (indicador no topo)
-- =====================================================================
-- Uma linha por semana, a partir da semana atual (p_weeks = quantas; a agenda mostra
-- 7 dias, então 2 cobre tudo). weekly_limit null = plano livre.
-- Só para aluno: coach/owner/visitante/drop-in não recebem linhas.
create or replace function my_week_usage(p_box uuid, p_weeks int default 2)
returns table (week_start date, week_end date, used int, weekly_limit int)
language sql stable security definer set search_path = public as $$
  select w.d::date, (w.d::date + 6), _weekly_used(p.id, w.d at time zone b.timezone), _weekly_limit(p)
    from people p
    join boxes b on b.id = p.box_id
    cross join lateral generate_series(
      _week_start(now(), b.timezone)::timestamp,
      _week_start(now(), b.timezone)::timestamp + make_interval(days => 7 * (greatest(least(p_weeks, 4), 1) - 1)),
      interval '7 days') as w(d)
   where p.box_id = p_box and p.auth_user_id = auth.uid() and p.role = 'aluno'
   order by 1
$$;


-- ---------- permissões ----------
revoke execute on function _weekly_used(uuid, timestamptz),
  _plan_allows_modality(people, uuid),
  _assert_plan_rules(people, class_sessions, schedule_slots, boxes, booking_type)
  from public, anon, authenticated;
revoke execute on function my_week_usage(uuid, int) from public, anon;
grant  execute on function my_week_usage(uuid, int) to authenticated, service_role;
