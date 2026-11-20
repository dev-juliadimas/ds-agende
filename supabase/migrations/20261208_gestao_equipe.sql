-- =====================================================================
-- Gestão da equipe no Painel do administrador (Alunos → Equipe)
--
--   • people.active: coach desativado (false) perde o acesso de equipe (is_staff),
--     some dos seletores de coach (staff_coaches) e não recebe aulas nem trocas
--     (_is_box_coach). O histórico de aulas dadas por ele continua com o nome dele.
--   • admin_members: passa a devolver e-mail (da conta), nascimento, active,
--     can_publish_notices_directly e quantas aulas o coach tem (fixas e futuras).
--   • admin_update_team_member: edita nome, WhatsApp, e-mail, nascimento, papel e
--     a permissão de publicar avisos direto. Não deixa o box sem administrador ativo.
--   • deactivate_coach: desativa o coach e, na mesma transação, passa a grade fixa
--     e as aulas de hoje em diante para outro coach/administrador ativo e encerra
--     os pedidos de troca pendentes dele.
--   • reactivate_coach: devolve o acesso (as aulas transferidas ficam com quem assumiu).
--
-- Depende de: 20261123_painel_admin.sql, 20261127_avisos_moderacao.sql,
-- 20261130_super_admin.sql, 20261207_coach_por_aula_e_trocas.sql.
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table people add column if not exists active boolean not null default true;
alter table people add column if not exists deactivated_at timestamptz;

-- ---------- só a equipe ATIVA tem acesso de equipe ----------
create or replace function is_staff(p_box uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p join boxes b on b.id = p.box_id
                  where p.box_id = p_box and p.auth_user_id = auth.uid() and p.role in ('owner','coach')
                    and p.active and b.is_active)
$$;

create or replace function is_owner(p_box uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p join boxes b on b.id = p.box_id
                  where p.box_id = p_box and p.auth_user_id = auth.uid() and p.role = 'owner'
                    and p.active and b.is_active)
$$;

-- destino válido de uma aula / troca: coach ou administrador ativo do box
create or replace function _is_box_coach(p_box uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where id = p_person and box_id = p_box and role in ('coach', 'owner') and active)
$$;
revoke execute on function _is_box_coach(uuid, uuid) from public, anon, authenticated;

create or replace function staff_coaches(p_box uuid)
returns table (person_id uuid, name text, role member_role)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_staff(p_box);
  return query
  select p.id, p.name, p.role from people p
   where p.box_id = p_box and p.role in ('coach', 'owner') and p.active and not coalesce(p.is_test, false)
   order by (p.role = 'owner'), p.name;
end $$;

-- ---------- aulas de um coach (a transferir) ----------
-- Início de "hoje" no fuso do box: a partir daí as aulas contam como futuras.
create or replace function _box_today_start(p_box uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((now() at time zone b.timezone)::date)::timestamp at time zone b.timezone from boxes b where b.id = p_box
$$;
revoke execute on function _box_today_start(uuid) from public, anon, authenticated;

-- fixed_slots: turmas ativas da grade em que ele é o coach fixo.
-- future_sessions: aulas de hoje em diante (não canceladas) em que ele é o coach da data.
create or replace function _coach_load(p_box uuid, p_coach uuid, out fixed_slots int, out future_sessions int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from schedule_slots sl where sl.box_id = p_box and sl.coach_id = p_coach and sl.active),
    (select count(*)::int from class_sessions s left join schedule_slots sl on sl.id = s.slot_id
      where s.box_id = p_box and not s.cancelled and s.starts_at >= _box_today_start(p_box)
        and coalesce(s.coach_override, sl.coach_id) = p_coach)
$$;
revoke execute on function _coach_load(uuid, uuid) from public, anon, authenticated;

-- ---------- admin_members com os dados da equipe ----------
drop function if exists admin_members(uuid);
create function admin_members(p_box uuid)
returns table (
  person_id         uuid,
  name              text,
  phone             text,
  role              member_role,
  is_test           boolean,
  plan_name         text,
  plan              plan_kind,
  financial_status  text,
  billing           text,          -- 'pago' | 'carencia' | 'bloqueado'
  due_date          date,
  days_late         int,           -- dias após o vencimento (0 = em dia)
  birth_day         int,
  birth_month       int,
  birthday_today    boolean,
  age               int,
  has_health_form   boolean,
  health_attention  boolean,       -- respondeu "Sim" a algo do PAR-Q
  pending_payment_id uuid,
  pending_amount    numeric,
  self_signup_at    timestamptz,
  created_at        timestamptz,
  last_class_at     timestamptz,
  last_class_status booking_status,
  trial_done        boolean,       -- visitante já fez (ou faltou) a experimental
  classes_30d       int,
  -- 20261208: gestão da equipe
  birth_date        date,
  email             text,          -- e-mail de login (null = sem conta no app)
  has_account       boolean,
  active            boolean,
  deactivated_at    timestamptz,
  can_publish_notices_directly boolean,
  fixed_slots       int,           -- só equipe: turmas fixas da grade
  future_sessions   int            -- só equipe: aulas de hoje em diante
)
language plpgsql stable security definer set search_path = public as $$
declare bx boxes; v_today date;
begin
  perform _assert_owner(p_box);
  select * into bx from boxes where id = p_box;
  v_today := (now() at time zone bx.timezone)::date;

  return query
  select
    p.id, p.name, p.phone, p.role, p.is_test,
    coalesce(pl.name, case p.plan when '2x' then '2x/semana' when '3x' then '3x/semana' when 'ilimitado' then 'Livre' end),
    p.plan, p.financial_status,
    billing_status(p.id),
    p.due_date,
    greatest(coalesce(v_today - p.due_date, 0), 0)::int,
    extract(day from p.birth_date)::int,
    extract(month from p.birth_date)::int,
    coalesce(is_birthday(p.birth_date, v_today), false),
    case when p.birth_date is not null then extract(year from age(v_today, p.birth_date))::int end,
    hf.person_id is not null,
    coalesce(hf.needs_attention, false),
    pay.id, pay.amount,
    p.self_signup_at, p.created_at,
    lb.starts_at, lb.status,
    exists (select 1 from bookings b where b.person_id = p.id and b.type = 'experimental' and b.status in ('presente', 'falta')),
    (select count(*)::int from bookings b join class_sessions s on s.id = b.session_id
      where b.person_id = p.id and b.status = 'presente' and s.starts_at > now() - interval '30 days'),
    p.birth_date,
    u.email::text,
    u.id is not null,
    p.active,
    p.deactivated_at,
    p.can_publish_notices_directly,
    cl.fixed_slots,
    cl.future_sessions
  from people p
  left join lateral _coach_load(p_box, p.id) cl on p.role in ('owner', 'coach')
  left join auth.users u on u.id = p.auth_user_id
  left join plans pl on pl.id = p.plan_id
  left join health_forms hf on hf.person_id = p.id
  left join lateral (
    select y.id, y.amount from payments y where y.person_id = p.id and y.status = 'pendente' order by y.created_at desc limit 1
  ) pay on true
  left join lateral (
    select s.starts_at, b.status from bookings b join class_sessions s on s.id = b.session_id
     where b.person_id = p.id and b.status not in ('cancelado', 'expirado')
     order by s.starts_at desc limit 1
  ) lb on true
  where p.box_id = p_box
  order by p.name;
end $$;

-- ---------- editar membro da equipe ----------
-- p_role: 'owner' | 'coach' | 'aluno'. p_email só vale para quem tem conta no app
-- (muda o e-mail de login). Devolve a linha atualizada de people.
create or replace function admin_update_team_member(
  p_box uuid, p_person uuid, p_name text, p_phone text, p_email text,
  p_birth_date date, p_role member_role, p_can_publish boolean
) returns people
language plpgsql security definer set search_path = public, auth as $$
declare
  p people; v_name text; v_phone text; v_email text; v_old_email text; v_load record; result people;
begin
  perform _assert_owner(p_box);
  select * into p from people where id = p_person and box_id = p_box for update;
  if p.id is null or p.role not in ('owner', 'coach') then raise exception 'MEMBRO_NAO_ENCONTRADO'; end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if length(v_name) < 3 or length(v_name) > 80 or position(' ' in v_name) = 0 then
    raise exception 'NOME_INVALIDO: Informe o nome completo (nome e sobrenome).';
  end if;

  v_phone := normalize_phone(p_phone);
  if v_phone is null or length(v_phone) not in (12, 13) then raise exception 'TELEFONE_INVALIDO'; end if;
  if exists (select 1 from people where box_id = p_box and id <> p_person and normalize_phone(phone) = v_phone) then
    raise exception 'TELEFONE_EM_USO';
  end if;

  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1900-01-01') then
    raise exception 'DATA_INVALIDA';
  end if;

  if p_role is null or p_role not in ('owner', 'coach', 'aluno') then raise exception 'PAPEL_INVALIDO'; end if;
  if p_role = 'owner' and not p.active then raise exception 'MEMBRO_INATIVO'; end if;
  -- o box nunca fica sem administrador ativo
  if p.role = 'owner' and p_role <> 'owner' and not exists (
       select 1 from people where box_id = p_box and id <> p_person and role = 'owner' and active) then
    raise exception 'ULTIMO_ADMIN';
  end if;
  -- quem vira aluno não pode levar aulas junto: transfira antes (Desativar coach)
  if p_role = 'aluno' then
    select * into v_load from _coach_load(p_box, p_person);
    if v_load.fixed_slots > 0 or v_load.future_sessions > 0 then raise exception 'COACH_COM_AULAS'; end if;
  end if;

  -- e-mail de login (auth.users)
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if p.auth_user_id is null then
    if v_email is not null then raise exception 'SEM_CONTA_APP'; end if;
  else
    select lower(email) into v_old_email from auth.users where id = p.auth_user_id;
    if v_email is null then raise exception 'EMAIL_INVALIDO'; end if;
    if v_email is distinct from v_old_email then
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then raise exception 'EMAIL_INVALIDO'; end if;
      if exists (select 1 from auth.users where lower(email) = v_email and id <> p.auth_user_id) then
        raise exception 'EMAIL_EM_USO';
      end if;
      update auth.users set email = v_email, updated_at = now() where id = p.auth_user_id;
      update auth.identities
         set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)), updated_at = now()
       where user_id = p.auth_user_id and provider = 'email';
    end if;
  end if;

  update people set
    name = v_name,
    phone = v_phone,
    birth_date = p_birth_date,
    role = p_role,
    -- a permissão de publicar direto só existe para coach
    can_publish_notices_directly = case when p_role = 'coach' then coalesce(p_can_publish, false) else false end
  where id = p_person
  returning * into result;
  return result;
end $$;

-- ---------- desativar coach com transferência obrigatória ----------
-- Atômico: valida, transfere grade fixa + aulas de hoje em diante, encerra as trocas
-- pendentes e marca o coach como inativo. p_replacement_coach_id é obrigatório
-- quando o coach tem turma fixa ativa ou aula futura.
-- Devolve {slots, sessions, swaps}: quantos itens foram transferidos/encerrados.
create or replace function deactivate_coach(p_box_id uuid, p_coach_id uuid, p_replacement_coach_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c people; v_today timestamptz; v_load record; v_slots int := 0; v_sessions int := 0; v_swaps int := 0; n int;
begin
  perform _assert_owner(p_box_id);
  select * into c from people where id = p_coach_id and box_id = p_box_id for update;
  if c.id is null then raise exception 'MEMBRO_NAO_ENCONTRADO'; end if;
  if c.role <> 'coach' then raise exception 'NAO_E_COACH'; end if;
  if not c.active then raise exception 'MEMBRO_INATIVO'; end if;
  if c.id = caller_person(p_box_id) then raise exception 'SEM_PERMISSAO'; end if;

  v_today := _box_today_start(p_box_id);
  select * into v_load from _coach_load(p_box_id, p_coach_id);

  if p_replacement_coach_id is not null then
    if p_replacement_coach_id = p_coach_id or not _is_box_coach(p_box_id, p_replacement_coach_id) then
      raise exception 'SUBSTITUTO_INVALIDO';
    end if;
    -- trava o substituto: ninguém o desativa no meio desta transação
    perform 1 from people where id = p_replacement_coach_id for share;
  elsif v_load.fixed_slots > 0 or v_load.future_sessions > 0 then
    raise exception 'SUBSTITUTO_OBRIGATORIO';
  end if;

  if p_replacement_coach_id is not null then
    -- 1. grade fixa. Aulas passadas dessas turmas guardam quem deu a aula (métricas e histórico).
    update class_sessions s set coach_override = p_coach_id
      from schedule_slots sl
     where sl.id = s.slot_id and sl.box_id = p_box_id and sl.coach_id = p_coach_id
       and s.starts_at < v_today and s.coach_override is null;

    -- (as aulas futuras que seguem a turma, sem override, passam junto com a grade)
    update schedule_slots set coach_id = p_replacement_coach_id
     where box_id = p_box_id and coach_id = p_coach_id;

    -- 2. aulas de hoje em diante com o coach só naquela data (coach_override):
    --    passam para o substituto, ou voltam a seguir a turma se ele já é o coach fixo dela
    update class_sessions s
       set coach_override = case when sl.coach_id = p_replacement_coach_id then null else p_replacement_coach_id end
      from schedule_slots sl
     where sl.id = s.slot_id and s.box_id = p_box_id and s.starts_at >= v_today and s.coach_override = p_coach_id;
    -- aulas especiais (sem turma fixa)
    update class_sessions set coach_override = p_replacement_coach_id
     where box_id = p_box_id and slot_id is null and starts_at >= v_today and coach_override = p_coach_id;
    -- aulas futuras das turmas transferidas que estavam "trocadas" para o próprio substituto
    -- agora seguem a turma (mesma regra de admin_set_slot_coach)
    update class_sessions s set coach_override = null
      from schedule_slots sl
     where sl.id = s.slot_id and s.box_id = p_box_id and s.starts_at >= v_today
       and sl.coach_id = p_replacement_coach_id and s.coach_override = p_replacement_coach_id;

    v_slots := coalesce(v_load.fixed_slots, 0);
    v_sessions := coalesce(v_load.future_sessions, 0);
  end if;

  -- 3. trocas pendentes envolvendo o coach: as que ele pediu são canceladas,
  --    as que pediram para ele são recusadas
  update coach_swaps set status = 'cancelada', decided_at = now()
   where box_id = p_box_id and status = 'pendente' and from_coach = p_coach_id;
  get diagnostics n = row_count;
  v_swaps := n;
  update coach_swaps set status = 'recusada', decided_at = now()
   where box_id = p_box_id and status = 'pendente' and to_coach = p_coach_id;
  get diagnostics n = row_count;
  v_swaps := v_swaps + n;

  -- 4. inativo: sem acesso de equipe, fora dos seletores de aula e de troca
  update people set active = false, deactivated_at = now(), can_publish_notices_directly = false
   where id = p_coach_id;

  return jsonb_build_object('slots', v_slots, 'sessions', v_sessions, 'swaps', v_swaps);
end $$;

create or replace function reactivate_coach(p_box_id uuid, p_coach_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare c people;
begin
  perform _assert_owner(p_box_id);
  select * into c from people where id = p_coach_id and box_id = p_box_id for update;
  if c.id is null then raise exception 'MEMBRO_NAO_ENCONTRADO'; end if;
  if c.role <> 'coach' then raise exception 'NAO_E_COACH'; end if;
  if c.active then return; end if;
  update people set active = true, deactivated_at = null where id = p_coach_id;
end $$;

-- ---------- permissões ----------
revoke execute on function
  admin_members(uuid),
  admin_update_team_member(uuid, uuid, text, text, text, date, member_role, boolean),
  deactivate_coach(uuid, uuid, uuid),
  reactivate_coach(uuid, uuid)
from public, anon;
grant execute on function
  admin_members(uuid),
  admin_update_team_member(uuid, uuid, text, text, text, date, member_role, boolean),
  deactivate_coach(uuid, uuid, uuid),
  reactivate_coach(uuid, uuid)
to authenticated, service_role;
