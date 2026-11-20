-- =====================================================================
-- Indique e Ganhe
--
-- Depende de: schema.sql, 20261122_auto_cadastro.sql (self_signup, _payment_paid_activate)
--             e 20261126_rls_privacidade_equipe.sql (people_read).
--
-- Fluxo:
--   1. O aluno abre o Perfil → my_referral(box) gera (uma vez) people.referral_code e
--      devolve o código + contagem das indicações. Link: /clientes/:slug/agenda?ref=CODIGO
--   2. O amigo abre o link → cai direto em "Criar conta"; o código vai no self_signup(p_ref).
--      Código válido do mesmo box: grava people.referred_by e cria referral_rewards 'pending'.
--      Código inválido/de outro box: o cadastro segue normalmente, sem indicação.
--   3. O admin dá baixa na 1ª mensalidade do indicado (confirm_payment → payments 'pago'):
--      o trigger payments_referral_earned marca a recompensa do indicador como 'earned'.
--      Vale também para o webhook do gateway, quando existir (mesma tabela payments).
--   4. 'used' = o box já aplicou a recompensa (desconto/brinde). Fica para o painel do admin.
--
-- Privacidade: referral_rewards não tem acesso direto pelo app (RLS ligado, sem política
-- para alunos). O aluno só vê contagens pelo my_referral, nunca o nome de quem se cadastrou.
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------- people: código próprio + quem indicou ----------
-- schema.sql antigo tinha referrer_id (sem uso no app): vira referred_by.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'referrer_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'referred_by') then
    alter table people rename column referrer_id to referred_by;
  end if;
end $$;
alter table people add column if not exists referred_by uuid references people(id) on delete set null;
alter table people add column if not exists referral_code text unique;
do $$ begin
  alter table people add constraint people_referral_code_chk check (referral_code ~ '^[A-Z0-9]{4,12}$');
exception when duplicate_object then null; end $$;


-- ---------- recompensas ----------
create table if not exists referral_rewards (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid not null references boxes(id) on delete cascade,
  referrer_id uuid not null references people(id) on delete cascade,
  referred_id uuid not null unique references people(id) on delete cascade,  -- cada pessoa é indicada uma vez só
  status      text not null default 'pending' check (status in ('pending', 'earned', 'used')),
  created_at  timestamptz not null default now(),
  earned_at   timestamptz,
  used_at     timestamptz,
  check (referrer_id <> referred_id)
);
create index if not exists referral_rewards_referrer_idx on referral_rewards (referrer_id, status);

alter table referral_rewards enable row level security;
drop policy if exists referral_rewards_owner_read on referral_rewards;
create policy referral_rewards_owner_read on referral_rewards for select to authenticated
  using (is_owner(box_id));
revoke all on referral_rewards from anon, authenticated;
grant select on referral_rewards to authenticated;


-- =====================================================================
-- Código do aluno + resumo das indicações (Perfil)
-- =====================================================================
-- Sem 0/O/1/I/L para não confundir quem digita o código.
create or replace function _new_referral_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
    from generate_series(1, 6)
$$;

create or replace function my_referral(p_box uuid)
returns table (code text, pending int, earned int, used int)
language plpgsql security definer set search_path = public as $$
declare p people; v_code text;
begin
  select * into p from people where box_id = p_box and auth_user_id = auth.uid() limit 1;
  if p.id is null then raise exception 'SEM_PERMISSAO'; end if;

  v_code := p.referral_code;
  while v_code is null loop
    begin
      update people set referral_code = _new_referral_code()
       where id = p.id and referral_code is null
       returning referral_code into v_code;
      if v_code is null then select referral_code into v_code from people where id = p.id; end if;  -- outra aba gerou
    exception when unique_violation then
      v_code := null;  -- colisão rara: tenta outro
    end;
  end loop;

  return query
    select v_code,
           count(*) filter (where r.status = 'pending')::int,
           count(*) filter (where r.status = 'earned')::int,
           count(*) filter (where r.status = 'used')::int
      from referral_rewards r where r.referrer_id = p.id;
end $$;


-- =====================================================================
-- self_signup com o código de indicação (p_ref)
-- =====================================================================
-- Mesma função de 20261122_auto_cadastro.sql: grava o cadastro e, no fim, liga a indicação.
-- A assinatura muda (novo parâmetro), então a versão antiga sai.
drop function if exists self_signup(uuid, text, uuid, text, text, date, uuid, boolean, jsonb, boolean, text);

create or replace function self_signup(
  p_user uuid, p_nonce text, p_box uuid,
  p_name text, p_phone text, p_birth date,
  p_plan uuid, p_trial boolean,
  p_health jsonb, p_consent boolean, p_consent_version text,
  p_ref text default null
) returns people language plpgsql security definer set search_path = public as $$
declare
  u auth.users; meta jsonb; pl plans; p people; v_check text; v_name text; v_role member_role; v_kind plan_kind;
  v_referrer uuid;
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

  -- Indicação: código de alguém deste box. Inválido não trava o cadastro.
  if nullif(trim(p_ref), '') is not null then
    select id into v_referrer from people where box_id = p_box and referral_code = upper(trim(p_ref));
  end if;

  -- 3. Cadastro
  insert into people (box_id, auth_user_id, name, phone, role, plan, plan_id, due_date,
                      birth_date, financial_status, self_signup_at, referred_by)
  values (p_box, p_user, v_name, '+' || normalize_phone(p_phone), v_role,
          case when v_role = 'aluno' then v_kind end,
          pl.id,
          case when v_role = 'aluno' then (now() at time zone (select timezone from boxes where id = p_box))::date end,
          p_birth,
          case when v_role = 'visitante' then 'experimental' else 'aguardando_pagamento' end,
          now(), v_referrer)
  returning * into p;

  if v_referrer is not null then
    insert into referral_rewards (box_id, referrer_id, referred_id) values (p_box, v_referrer, p.id)
    on conflict (referred_id) do nothing;
  end if;

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


-- =====================================================================
-- 1ª mensalidade paga do indicado → recompensa do indicador 'earned'
-- =====================================================================
-- Trigger em payments (como _payment_paid_activate): vale para a baixa do admin
-- (confirm_payment) e para o webhook do gateway. Visitante que vira aluno depois
-- também conta: a recompensa espera 'pending' até a 1ª mensalidade.
create or replace function _payment_referral_earned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' and old.status is distinct from 'pago' and new.kind = 'mensalidade'
     and not exists (select 1 from payments y where y.person_id = new.person_id and y.kind = 'mensalidade'
                       and y.status = 'pago' and y.id <> new.id) then
    update referral_rewards set status = 'earned', earned_at = now()
     where referred_id = new.person_id and status = 'pending';
  end if;
  return new;
end $$;

drop trigger if exists payments_referral_earned on payments;
create trigger payments_referral_earned after update of status on payments
  for each row execute function _payment_referral_earned();


-- ---------- permissões ----------
revoke execute on function _new_referral_code(), _payment_referral_earned() from public, anon, authenticated;

revoke execute on function my_referral(uuid) from public, anon;
grant  execute on function my_referral(uuid) to authenticated, service_role;

-- anon também: sem sessão até confirmar o e-mail (protegido pelo nonce)
revoke execute on function self_signup(uuid, text, uuid, text, text, date, uuid, boolean, jsonb, boolean, text, text) from public;
grant  execute on function self_signup(uuid, text, uuid, text, text, date, uuid, boolean, jsonb, boolean, text, text)
  to anon, authenticated, service_role;
