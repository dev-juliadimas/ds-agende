-- =====================================================================
-- Trava das RPCs: cada função só age em nome de quem está logado.
--
-- Antes: as RPCs são `security definer` e confiam em p_person, então
-- qualquer usuário logado (ou até anônimo) podia reservar/cancelar por
-- outra pessoa, encerrar aula, confirmar o próprio pagamento etc.
--
-- Estratégia:
--   • a função original é renomeada para _nome (lógica intacta) e perde o
--     EXECUTE público;
--   • uma nova função com o nome antigo checa a permissão e chama a _nome;
--   • rotinas de sistema (fila, recorrência, cobrança, jobs) deixam de ser
--     chamáveis pelo app.
--
-- Quem é "confiável" (pula as checagens): service_role (bot de WhatsApp /
-- Edge Functions / webhook do gateway) e chamadas sem requisição HTTP
-- (pg_cron, SQL Editor).
--
-- Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- helpers ----------

create or replace function is_trusted_caller() returns boolean
language sql stable set search_path = public as $$
  select nullif(current_setting('request.jwt.claims', true), '') is null           -- pg_cron / SQL Editor
      or (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
$$;

-- people.id do usuário logado no box (null se não for membro)
create or replace function caller_person(p_box uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from people where box_id = p_box and auth_user_id = auth.uid() limit 1
$$;

-- ---------- renomeia as originais (só na 1ª execução) ----------

do $$ begin
  if to_regprocedure('public._book_class(uuid,uuid,booking_type,channel,boolean)') is null then
    alter function public.book_class(uuid, uuid, booking_type, channel, boolean) rename to _book_class;
  end if;
  if to_regprocedure('public._cancel_booking(uuid,channel,boolean)') is null then
    alter function public.cancel_booking(uuid, channel, boolean) rename to _cancel_booking;
  end if;
  if to_regprocedure('public._checkin_qr(uuid,text,uuid)') is null then
    alter function public.checkin_qr(uuid, text, uuid) rename to _checkin_qr;
  end if;
  if to_regprocedure('public._close_session(uuid)') is null then
    alter function public.close_session(uuid) rename to _close_session;
  end if;
  if to_regprocedure('public._confirm_payment(uuid,pay_method,uuid)') is null then
    alter function public.confirm_payment(uuid, pay_method, uuid) rename to _confirm_payment;
  end if;
end $$;

-- ---------- book_class ----------
-- Aluno: só para si, só tipo 'avulso', pelo app ('web'), sem pré-reserva.
--   (experimental / drop-in / extra / pré-reserva passam por create_charge, que cobra)
-- Coach/owner: qualquer pessoa do próprio box, qualquer tipo.
create or replace function book_class(p_session uuid, p_person uuid, p_type booking_type, p_source channel, p_hold boolean default false)
returns bookings language plpgsql security definer set search_path = public as $$
declare v_box uuid;
begin
  select box_id into v_box from class_sessions where id = p_session;
  if v_box is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  if not exists (select 1 from people where id = p_person and box_id = v_box) then raise exception 'SEM_PERMISSAO'; end if;

  if not is_trusted_caller() then
    if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
    if not is_staff(v_box) then
      if caller_person(v_box) is distinct from p_person then raise exception 'SEM_PERMISSAO'; end if;
      if p_type <> 'avulso' or p_hold or p_source <> 'web' then raise exception 'SEM_PERMISSAO'; end if;
    end if;
  end if;

  return _book_class(p_session, p_person, p_type, p_source, p_hold);
end $$;

-- ---------- cancel_booking ----------
-- Aluno: só a própria reserva, sem p_force. Coach/owner: qualquer reserva do box, pode forçar.
create or replace function cancel_booking(p_booking uuid, p_source channel, p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_box uuid; v_person uuid; v_status booking_status;
begin
  select s.box_id, b.person_id, b.status into v_box, v_person, v_status
    from bookings b join class_sessions s on s.id = b.session_id where b.id = p_booking;
  if v_box is null then raise exception 'RESERVA_NAO_ENCONTRADA'; end if;
  if v_status not in ('reservado', 'pre_reserva') then raise exception 'RESERVA_INATIVA'; end if;

  if not is_trusted_caller() then
    if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
    if not is_staff(v_box) then
      if caller_person(v_box) is distinct from v_person then raise exception 'SEM_PERMISSAO'; end if;
      if p_force or p_source <> 'web' then raise exception 'SEM_PERMISSAO'; end if;
    end if;
  end if;

  perform _cancel_booking(p_booking, p_source, p_force);
end $$;

-- ---------- checkin_qr ----------
-- Só o próprio aluno faz check-in por QR (presença de terceiros = check-in manual do coach).
create or replace function checkin_qr(p_session uuid, p_token text, p_person uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_box uuid;
begin
  select box_id into v_box from class_sessions where id = p_session;
  if v_box is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;

  if not is_trusted_caller() then
    if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
    if caller_person(v_box) is distinct from p_person then raise exception 'SEM_PERMISSAO'; end if;
  end if;

  perform _checkin_qr(p_session, p_token, p_person);
end $$;

-- ---------- close_session ----------
-- Só coach/owner do box.
create or replace function close_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_box uuid;
begin
  select box_id into v_box from class_sessions where id = p_session;
  if v_box is null then raise exception 'AULA_NAO_ENCONTRADA'; end if;
  if not is_trusted_caller() and not is_staff(v_box) then raise exception 'SEM_PERMISSAO'; end if;
  perform _close_session(p_session);
end $$;

-- ---------- confirm_payment ----------
-- Webhook do gateway (service_role) ou baixa manual da equipe.
-- Na baixa manual, p_by é sempre quem está logado (não dá para assinar por outro).
create or replace function confirm_payment(p_payment uuid, p_method pay_method default null, p_by uuid default null)
returns payments language plpgsql security definer set search_path = public as $$
declare v_box uuid;
begin
  select box_id into v_box from payments where id = p_payment;
  if v_box is null then raise exception 'COBRANCA_NAO_ENCONTRADA'; end if;
  if is_trusted_caller() then
    return _confirm_payment(p_payment, p_method, p_by);
  end if;
  if not is_staff(v_box) then raise exception 'SEM_PERMISSAO'; end if;
  return _confirm_payment(p_payment, p_method, caller_person(v_box));
end $$;

-- ---------- create_charge ----------
-- Mesma lógica do schema.sql + checagem: aluno só cobra a si mesmo; equipe cobra qualquer um do box.
-- Chama _book_class porque aqui a venda avulsa (extra/drop-in/pré-reserva) é legítima: ela gera cobrança.
create or replace function create_charge(p_person uuid, p_kind pay_kind, p_method pay_method,
                                         p_plan plan_kind default null, p_session uuid default null, p_source channel default 'web')
returns payments language plpgsql security definer set search_path = public as $$
declare p people; bx boxes; bk bookings; v numeric; result payments;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'SEM_PERMISSAO'; end if;
  select * into bx from boxes where id = p.box_id;

  if not is_trusted_caller() then
    if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
    if not is_staff(p.box_id) then
      if caller_person(p.box_id) is distinct from p_person then raise exception 'SEM_PERMISSAO'; end if;
      if p_source <> 'web' then raise exception 'SEM_PERMISSAO'; end if;
    end if;
    if p_session is not null and not exists (select 1 from class_sessions where id = p_session and box_id = p.box_id) then
      raise exception 'SEM_PERMISSAO';
    end if;
  end if;

  v := case p_kind
         when 'mensalidade' then case coalesce(p_plan, p.plan) when '2x' then bx.price_2x when '3x' then bx.price_3x else bx.price_ilimitado end
         when 'dropin' then bx.price_dropin
         else bx.price_extra end;
  if p_session is not null then
    bk := _book_class(p_session, p_person, p_kind::text::booking_type, p_source, p_method in ('pix','cartao'));
    if p_method = 'recepcao' then update bookings set pay_pending = true where id = bk.id; end if;
  end if;
  if p_kind = 'mensalidade' then   -- só uma mensalidade pendente por aluno
    update payments set status = 'cancelado' where person_id = p_person and kind = 'mensalidade' and status = 'pendente';
  end if;
  insert into payments(box_id, person_id, kind, plan, amount, method, booking_id)
    values (p.box_id, p_person, p_kind, case when p_kind = 'mensalidade' then coalesce(p_plan, p.plan) end, v, p_method, bk.id)
    returning * into result;
  return result;
end $$;

-- ---------- promote_waitlist ----------
-- Igual ao schema.sql, mas chama _book_class: a promoção roda dentro do
-- cancelamento de um aluno e reserva para OUTRA pessoa (o 1º da fila).
create or replace function promote_waitlist(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w record; s class_sessions;
begin
  select * into s from class_sessions where id = p_session;
  for w in select person_id from waitlist where session_id = p_session order by position loop
    begin
      perform _book_class(p_session, w.person_id, 'avulso', 'sistema');
      insert into whatsapp_outbox(box_id, person_id, kind, payload, meta_category)
        select s.box_id, w.person_id, 'waitlist', jsonb_build_object('session_id', p_session), 'utilidade'
        from boxes where id = s.box_id and dispatch_waitlist;
      return;
    exception when others then
      delete from waitlist where session_id = p_session and person_id = w.person_id;
    end;
  end loop;
end $$;

-- materialize_recurrence chamava book_class com tipo 'recorrente', que a trava recusaria
-- para um aluno logado (ex.: confirm_payment feito pela equipe). Passa a usar _book_class.
create or replace function materialize_recurrence(p_rec uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r recurrences; cs record; n int := 0;
begin
  select * into r from recurrences where id = p_rec and active;
  if not found or billing_status(r.person_id) = 'bloqueado' then return 0; end if;
  for cs in select c.id from class_sessions c join schedule_slots sl on sl.id = c.slot_id
            where sl.weekday = any(r.weekdays) and sl.start_time = r.start_time
              and c.starts_at > now() and c.starts_at < now() + interval '7 days' and not c.cancelled
              and not exists (select 1 from bookings b where b.session_id = c.id and b.person_id = r.person_id
                              and b.status in ('reservado','presente','pre_reserva')) loop
    begin
      perform _book_class(cs.id, r.person_id, 'recorrente', 'sistema');
      n := n + 1;
    exception when others then null;  -- lotada / limite do plano: segue para a próxima
    end;
  end loop;
  return n;
end $$;

-- ---------- permissões de EXECUTE ----------
-- No Supabase, anon e authenticated recebem EXECUTE por padrão em funções novas do schema public.

-- internas e rotinas de sistema: só o banco (e service_role para Edge Functions/jobs)
revoke execute on function
  _book_class(uuid, uuid, booking_type, channel, boolean),
  _cancel_booking(uuid, channel, boolean),
  _checkin_qr(uuid, text, uuid),
  _close_session(uuid),
  _confirm_payment(uuid, pay_method, uuid),
  promote_waitlist(uuid),
  materialize_recurrence(uuid),
  enforce_billing(),
  expire_holds(),
  refresh_session_counters(uuid)
from public, anon, authenticated;

grant execute on function
  promote_waitlist(uuid), materialize_recurrence(uuid), enforce_billing(), expire_holds()
to service_role;

-- públicas do app: só para quem está logado (o bot usa service_role)
revoke execute on function
  book_class(uuid, uuid, booking_type, channel, boolean),
  cancel_booking(uuid, channel, boolean),
  checkin_qr(uuid, text, uuid),
  close_session(uuid),
  confirm_payment(uuid, pay_method, uuid),
  create_charge(uuid, pay_kind, pay_method, plan_kind, uuid, channel)
from public, anon;

grant execute on function
  book_class(uuid, uuid, booking_type, channel, boolean),
  cancel_booking(uuid, channel, boolean),
  checkin_qr(uuid, text, uuid),
  close_session(uuid),
  confirm_payment(uuid, pay_method, uuid),
  create_charge(uuid, pay_kind, pay_method, plan_kind, uuid, channel)
to authenticated, service_role;

-- =====================================================================
-- RLS das tabelas que o front lê/escreve direto
-- (o schema.sql liga o RLS de bookings/people mas não cria as políticas:
--  sem elas, nenhum aluno consegue ler nada.)
-- =====================================================================

-- bookings: leitura das próprias + equipe vê o box. Escrita só via RPC (sem policy de insert/update/delete).
drop policy if exists bookings_read on bookings;
create policy bookings_read on bookings for select to authenticated
  using (
    person_id in (select id from people where auth_user_id = auth.uid())
    or exists (select 1 from class_sessions s where s.id = session_id and is_staff(s.box_id))
  );

-- people: cada um vê o próprio cadastro; equipe vê o box.
drop policy if exists people_read on people;
create policy people_read on people for select to authenticated
  using (auth_user_id = auth.uid() or is_staff(box_id));

-- waitlist: o front entra/sai da fila direto na tabela
alter table waitlist enable row level security;

drop policy if exists waitlist_read on waitlist;
create policy waitlist_read on waitlist for select to authenticated
  using (
    person_id in (select id from people where auth_user_id = auth.uid())
    or exists (select 1 from class_sessions s where s.id = session_id and is_staff(s.box_id))
  );

-- entra só a si mesmo, numa aula do próprio box que ainda não começou
drop policy if exists waitlist_join on waitlist;
create policy waitlist_join on waitlist for insert to authenticated
  with check (
    exists (
      select 1 from people p join class_sessions s on s.box_id = p.box_id
      where p.id = person_id and p.auth_user_id = auth.uid()
        and s.id = session_id and not s.cancelled and s.closed_at is null and s.starts_at > now()
    )
  );

drop policy if exists waitlist_leave on waitlist;
create policy waitlist_leave on waitlist for delete to authenticated
  using (
    person_id in (select id from people where auth_user_id = auth.uid())
    or exists (select 1 from class_sessions s where s.id = session_id and is_staff(s.box_id))
  );

grant usage on sequence waitlist_position_seq to authenticated;
