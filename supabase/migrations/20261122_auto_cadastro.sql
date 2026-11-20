-- =====================================================================
-- Auto-cadastro do aluno (Criar conta sem pré-cadastro do box)
--
-- Depende de: schema.sql, 20261118_lock_rpcs.sql, 20261119_icara_training_club.sql (plans),
--             20261120_agenda_aluno.sql (app_book_class) e 20261121_login_email.sql (normalize_phone).
--
-- Fluxo (src/agenda/signup/SignupWizard.jsx):
--   0. Antes de criar a conta: check_self_signup(box, telefone, data de nascimento) e
--      get_signup_plans(box) — chamáveis sem login.
--   1. supabase.auth.signUp(e-mail, senha, metadata { self_signup: { box_id, nonce } }).
--      O nonce é um código aleatório gerado no navegador: só quem criou a conta o conhece.
--   2. self_signup(user_id, nonce, ...) grava TUDO numa transação só:
--        people (aluno / visitante / drop-in) + health_forms (PAR-Q + consentimento LGPD)
--        + payments pendente (quando escolheu um plano) e apaga o nonce.
--      Aceita chamada sem sessão (o projeto exige confirmar o e-mail, então o signUp não
--      devolve sessão): a prova é o nonce + conta criada há menos de 30 min + ainda sem cadastro.
--      Com sessão (e-mail já confirmado), basta ser o próprio usuário.
--   3. Ao confirmar o e-mail (ou na hora, se a confirmação estiver desligada), o aluno cai
--      na Agenda já ligado ao cadastro, com o plano e o status financeiro inicial.
--
-- Status financeiro inicial (people.financial_status):
--   'aguardando_pagamento' → escolheu plano ou aula avulsa. Gera cobrança pendente
--                            (pagar na recepção até o gateway ser definido). Vence hoje:
--                            reserva durante a carência do box (grace_days) e depois bloqueia
--                            pela regra já existente (billing_status / enforce_billing).
--   'experimental'         → "Quero começar com uma Aula Experimental": role 'visitante',
--                            reserva 1 aula do tipo experimental (turmas Iniciante/Mista).
--   'ativo'                → cadastro do box ou mensalidade paga (trigger em payments).
--
-- LGPD: a anamnese é dado sensível de saúde (art. 11). Fica só em health_forms, com
-- consent_at = now() e a versão do termo aceito. RLS: o aluno pode inserir a própria
-- ficha; só coach/owner do box leem. Nada de saúde vai para user_metadata/JWT.
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------- people: plano do catálogo + status financeiro ----------
alter table people add column if not exists plan_id uuid references plans(id) on delete set null;
alter table people add column if not exists financial_status text not null default 'ativo';
do $$ begin
  alter table people add constraint people_financial_status_chk
    check (financial_status in ('ativo', 'aguardando_pagamento', 'experimental'));
exception when duplicate_object then null; end $$;
alter table people add column if not exists self_signup_at timestamptz;   -- veio do auto-cadastro

-- Um WhatsApp por pessoa no box quando o cadastro é feito pelo próprio aluno
-- (o box pode ter "mãe e filho" com o mesmo número nos cadastros antigos).
create unique index if not exists people_self_signup_phone_uq
  on people (box_id, normalize_phone(phone)) where self_signup_at is not null;

-- ---------- payments: qual plano do catálogo foi cobrado ----------
alter table payments add column if not exists plan_id uuid references plans(id) on delete set null;


-- ---------- health_forms: PAR-Q completo + consentimento ----------
alter table health_forms add column if not exists has_heart_condition  boolean;
alter table health_forms add column if not exists heart_condition_info text;
alter table health_forms add column if not exists has_chest_pain       boolean;
alter table health_forms add column if not exists chest_pain_info      text;
alter table health_forms add column if not exists had_dizziness        boolean;
alter table health_forms add column if not exists dizziness_info       text;
alter table health_forms add column if not exists has_injury           boolean;
alter table health_forms add column if not exists injury_info          text;
alter table health_forms add column if not exists uses_medication      boolean;
alter table health_forms add column if not exists medication_info      text;
alter table health_forms add column if not exists coach_notes          text;
alter table health_forms add column if not exists consent_version      text;
alter table health_forms add column if not exists created_at           timestamptz not null default now();
alter table health_forms add column if not exists updated_at           timestamptz not null default now();

-- Alguma resposta "Sim": o coach vê o alerta sem abrir a ficha inteira
alter table health_forms add column if not exists needs_attention boolean
  generated always as (coalesce(has_heart_condition or has_chest_pain or had_dizziness or has_injury, false)) stored;

do $$ begin
  alter table health_forms add constraint health_forms_text_len_chk check (
    coalesce(length(heart_condition_info), 0) <= 500 and coalesce(length(chest_pain_info), 0) <= 500 and
    coalesce(length(dizziness_info), 0) <= 500 and coalesce(length(injury_info), 0) <= 500 and
    coalesce(length(medication_info), 0) <= 500 and coalesce(length(coach_notes), 0) <= 1000);
exception when duplicate_object then null; end $$;

-- RLS (o schema.sql liga o RLS mas não cria políticas).
-- Insert: só a própria ficha. Select: só a equipe do box. Sem update/delete pelo app.
alter table health_forms enable row level security;

drop policy if exists health_forms_insert_own on health_forms;
create policy health_forms_insert_own on health_forms for insert to authenticated
  with check (person_id in (select id from people where auth_user_id = auth.uid()) and consent_at is not null);

drop policy if exists health_forms_staff_read on health_forms;
create policy health_forms_staff_read on health_forms for select to authenticated
  using (exists (select 1 from people p where p.id = person_id and is_staff(p.box_id)));

revoke all on health_forms from anon, authenticated;
grant insert (person_id, injuries, experience, consent_at,
              has_heart_condition, heart_condition_info, has_chest_pain, chest_pain_info,
              had_dizziness, dizziness_info, has_injury, injury_info,
              uses_medication, medication_info, coach_notes, consent_version)
  on health_forms to authenticated;
grant select on health_forms to authenticated;


-- =====================================================================
-- Limite semanal: catálogo de planos primeiro, plan_kind antigo como reserva
-- =====================================================================
-- null = livre. Usado por _book_class (app e bot) e pela pré-checagem da fila.
create or replace function _weekly_limit(p people)
returns int language sql stable security definer set search_path = public as $$
  select case
    when p.plan_id is not null then (select weekly_limit from plans where id = p.plan_id)
    when p.plan = '2x' then 2
    when p.plan = '3x' then 3
    when p.plan = 'ilimitado' then null
    else 3 end
$$;

-- Mesma lógica de schema.sql/book_class, trocando o limite fixo por _weekly_limit().
create or replace function _book_class(p_session uuid, p_person uuid, p_type booking_type, p_source channel, p_hold boolean default false)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; sl schedule_slots; bx boxes; cap int; taken int; trials int; p people; weekly int; v_limit int; result bookings;
begin
  select * into s from class_sessions where id = p_session for update;
  select * into sl from schedule_slots where id = s.slot_id;
  select * into bx from boxes where id = s.box_id;
  if s.cancelled or s.closed_at is not null or s.starts_at < now() - interval '15 minutes' then
    raise exception 'AULA_ENCERRADA';
  end if;
  if p_type <> 'recorrente'
     and (s.starts_at at time zone bx.timezone)::date - (now() at time zone bx.timezone)::date > bx.book_ahead_days then
    raise exception 'AGENDA_FECHADA';
  end if;
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
  select * into p from people where id = p_person;
  if p.role = 'aluno' and billing_status(p_person) = 'bloqueado' then raise exception 'ACESSO_BLOQUEADO'; end if;
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
-- app_book_class: visitante (experimental) e drop-in reservam 1 aula
-- =====================================================================
-- Mesma função de 20261120_agenda_aluno.sql, com:
--   • visitante → reserva do tipo 'experimental'; drop-in → 'dropin' (regras de venda avulsa)
--   • os dois: no máximo 1 aula (reservada, feita ou faltada) e sem lista de espera
--   • limite semanal do aluno pelo catálogo de planos (_weekly_limit)
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
  if p.role = 'aluno' and billing_status(p_person) = 'bloqueado' then raise exception 'ACESSO_BLOQUEADO'; end if;
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
-- Pagou a mensalidade/avulsa → sai de "aguardando pagamento"
-- =====================================================================
-- Trigger em vez de mexer em _confirm_payment (vale para webhook, baixa manual e bot).
create or replace function _payment_paid_activate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    update people set financial_status = 'ativo',
                      plan_id = case when new.kind = 'mensalidade' then coalesce(new.plan_id, plan_id) else plan_id end
     where id = new.person_id and financial_status = 'aguardando_pagamento';
  end if;
  return new;
end $$;

drop trigger if exists payments_paid_activate on payments;
create trigger payments_paid_activate after update of status on payments
  for each row execute function _payment_paid_activate();


-- =====================================================================
-- Antes do cadastro (sem login)
-- =====================================================================

-- Planos que o aluno pode escolher sozinho: planos e aula avulsa ativos (adicionais ficam de fora).
create or replace function get_signup_plans(p_box uuid)
returns table (id uuid, code text, name text, family text, kind text, weekly_limit smallint, period text,
               months smallint, monthly_price numeric, total_price numeric, display_order int, modalities text[])
language sql stable security definer set search_path = public as $$
  select pl.id, pl.code, pl.name, pl.family, pl.kind, pl.weekly_limit, pl.period, pl.months,
         pl.monthly_price, pl.total_price, pl.display_order,
         coalesce(array_agg(m.name order by m.display_order) filter (where m.id is not null), '{}')
    from plans pl
    left join plan_modalities pm on pm.plan_id = pl.id
    left join modalities m on m.id = pm.modality_id
   where pl.box_id = p_box and pl.active and pl.kind in ('plano', 'aula_avulsa')
   group by pl.id
   order by pl.display_order
$$;

-- 'ok' | 'telefone_invalido' | 'telefone_ja_cadastrado' | 'data_invalida' | 'menor_de_idade'
-- Não diz de quem é o telefone. 'telefone_ja_cadastrado' manda para "Já sou aluno do box".
create or replace function check_self_signup(p_box uuid, p_phone text, p_birth date)
returns text language sql stable security definer set search_path = public as $$
  select case
    when normalize_phone(p_phone) is null or length(normalize_phone(p_phone)) not in (12, 13) then 'telefone_invalido'
    when exists (select 1 from people where box_id = p_box and normalize_phone(phone) = normalize_phone(p_phone)) then 'telefone_ja_cadastrado'
    when p_birth is null or p_birth > current_date or p_birth < current_date - interval '100 years' then 'data_invalida'
    when p_birth > current_date - interval '18 years' then 'menor_de_idade'
    else 'ok' end
$$;


-- =====================================================================
-- Grava o cadastro (uma transação)
-- =====================================================================
-- p_plan  = plans.id escolhido, ou null com p_trial = true (aula experimental).
-- p_health = { has_heart_condition, heart_condition_info, has_chest_pain, chest_pain_info,
--              had_dizziness, dizziness_info, has_injury, injury_info,
--              uses_medication, medication_info, coach_notes }
-- Devolve o people criado.
create or replace function self_signup(
  p_user uuid, p_nonce text, p_box uuid,
  p_name text, p_phone text, p_birth date,
  p_plan uuid, p_trial boolean,
  p_health jsonb, p_consent boolean, p_consent_version text
) returns people language plpgsql security definer set search_path = public as $$
declare
  u auth.users; meta jsonb; pl plans; p people; v_check text; v_name text; v_role member_role; v_kind plan_kind;
  h jsonb := coalesce(p_health, '{}'::jsonb);
begin
  -- 1. Quem está chamando é dono da conta p_user
  perform pg_advisory_xact_lock(hashtext('self_signup:' || p_user::text));   -- clique duplo
  select * into u from auth.users where id = p_user;
  if u.id is null then raise exception 'CADASTRO_EXPIRADO'; end if;
  meta := u.raw_user_meta_data -> 'self_signup';

  if auth.uid() is not null then
    if auth.uid() <> p_user then raise exception 'SEM_PERMISSAO'; end if;
    if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'SEM_PERMISSAO'; end if;
  else
    -- sem sessão (e-mail ainda não confirmado): nonce do signUp + conta recém-criada
    if meta is null or p_nonce is null or length(p_nonce) < 32
       or meta ->> 'nonce' is distinct from p_nonce
       or u.created_at < now() - interval '30 minutes' then
      raise exception 'CADASTRO_EXPIRADO';
    end if;
  end if;
  if meta is not null and (meta ->> 'box_id')::uuid is distinct from p_box then raise exception 'SEM_PERMISSAO'; end if;
  if not exists (select 1 from boxes where id = p_box) then raise exception 'BOX_NAO_ENCONTRADO'; end if;

  -- já tem cadastro neste box: devolve (clique duplo / reenvio)
  select * into p from people where box_id = p_box and auth_user_id = p_user;
  if p.id is not null then return p; end if;

  -- 2. Validações
  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if length(v_name) < 5 or position(' ' in v_name) = 0 or length(v_name) > 120 then raise exception 'NOME_INVALIDO'; end if;

  v_check := check_self_signup(p_box, p_phone, p_birth);
  if v_check <> 'ok' then raise exception '%', upper(v_check); end if;

  if not coalesce(p_consent, false) then raise exception 'CONSENTIMENTO_OBRIGATORIO'; end if;
  if (h ->> 'has_heart_condition') is null or (h ->> 'has_chest_pain') is null or (h ->> 'had_dizziness') is null
     or (h ->> 'has_injury') is null or (h ->> 'uses_medication') is null then
    raise exception 'ANAMNESE_INCOMPLETA';
  end if;

  if coalesce(p_trial, false) then
    v_role := 'visitante';
  else
    select * into pl from plans where id = p_plan and box_id = p_box and active and kind in ('plano', 'aula_avulsa');
    if pl.id is null then raise exception 'PLANO_INVALIDO'; end if;
    v_role := case when pl.kind = 'aula_avulsa' then 'dropin' else 'aluno' end;
    v_kind := case pl.weekly_limit when 2 then '2x' when 3 then '3x' else case when pl.weekly_limit is null then 'ilimitado' end end;
  end if;

  -- 3. Cadastro
  insert into people (box_id, auth_user_id, name, phone, role, plan, plan_id, due_date,
                      birth_date, financial_status, self_signup_at)
  values (p_box, p_user, v_name, '+' || normalize_phone(p_phone), v_role,
          case when v_role = 'aluno' then v_kind end,
          pl.id,
          case when v_role = 'aluno' then (now() at time zone (select timezone from boxes where id = p_box))::date end,
          p_birth,
          case when v_role = 'visitante' then 'experimental' else 'aguardando_pagamento' end,
          now())
  returning * into p;

  -- 4. Anamnese (PAR-Q) + consentimento LGPD
  insert into health_forms (person_id, consent_at, consent_version,
                            has_heart_condition, heart_condition_info, has_chest_pain, chest_pain_info,
                            had_dizziness, dizziness_info, has_injury, injury_info,
                            uses_medication, medication_info, coach_notes, injuries)
  values (p.id, now(), left(coalesce(p_consent_version, 'v1'), 40),
          (h ->> 'has_heart_condition')::boolean, nullif(left(trim(h ->> 'heart_condition_info'), 500), ''),
          (h ->> 'has_chest_pain')::boolean,      nullif(left(trim(h ->> 'chest_pain_info'), 500), ''),
          (h ->> 'had_dizziness')::boolean,       nullif(left(trim(h ->> 'dizziness_info'), 500), ''),
          (h ->> 'has_injury')::boolean,          nullif(left(trim(h ->> 'injury_info'), 500), ''),
          (h ->> 'uses_medication')::boolean,     nullif(left(trim(h ->> 'medication_info'), 500), ''),
          nullif(left(trim(h ->> 'coach_notes'), 1000), ''),
          nullif(left(trim(h ->> 'injury_info'), 500), ''))
  on conflict (person_id) do update set
    consent_at = excluded.consent_at, consent_version = excluded.consent_version,
    has_heart_condition = excluded.has_heart_condition, heart_condition_info = excluded.heart_condition_info,
    has_chest_pain = excluded.has_chest_pain, chest_pain_info = excluded.chest_pain_info,
    had_dizziness = excluded.had_dizziness, dizziness_info = excluded.dizziness_info,
    has_injury = excluded.has_injury, injury_info = excluded.injury_info,
    uses_medication = excluded.uses_medication, medication_info = excluded.medication_info,
    coach_notes = excluded.coach_notes, injuries = excluded.injuries, updated_at = now();

  -- 5. Cobrança inicial (pagar na recepção até o gateway ser escolhido)
  if pl.id is not null then
    insert into payments (box_id, person_id, kind, plan, plan_id, amount, method)
    values (p_box, p.id, case when pl.kind = 'aula_avulsa' then 'dropin' else 'mensalidade' end::pay_kind,
            case when pl.kind = 'plano' then v_kind end, pl.id, pl.total_price, 'recepcao');
  end if;

  -- 6. O nonce só vale uma vez
  begin
    update auth.users set raw_user_meta_data = raw_user_meta_data #- '{self_signup,nonce}' where id = p_user;
  exception when insufficient_privilege then
    null;  -- sem permissão no schema auth: o cadastro já existe, então o nonce só devolveria este mesmo registro
  end;

  return p;
end $$;

-- Status para a tela (o aluno não lê payments de outros nem plans antes de ser membro)
create or replace function my_signup_status(p_box uuid)
returns table (financial_status text, plan_name text, pending_amount numeric)
language sql stable security definer set search_path = public as $$
  select p.financial_status, pl.name,
         (select amount from payments where person_id = p.id and status = 'pendente' order by created_at desc limit 1)
    from people p left join plans pl on pl.id = p.plan_id
   where p.box_id = p_box and p.auth_user_id = auth.uid()
$$;


-- ---------- permissões ----------
revoke execute on function _weekly_limit(people), _payment_paid_activate() from public, anon, authenticated;

revoke execute on function get_signup_plans(uuid), check_self_signup(uuid, text, date) from public;
grant  execute on function get_signup_plans(uuid), check_self_signup(uuid, text, date) to anon, authenticated, service_role;

-- anon também: sem sessão até confirmar o e-mail (protegido pelo nonce)
revoke execute on function self_signup(uuid, text, uuid, text, text, date, uuid, boolean, jsonb, boolean, text) from public;
grant  execute on function self_signup(uuid, text, uuid, text, text, date, uuid, boolean, jsonb, boolean, text)
  to anon, authenticated, service_role;

revoke execute on function my_signup_status(uuid) from public, anon;
grant  execute on function my_signup_status(uuid) to authenticated, service_role;

-- O check_signup_phone (login_email) bloqueava telefones fora do cadastro; continua valendo
-- para "Já sou aluno do box". Quem não está no cadastro usa este auto-cadastro.
