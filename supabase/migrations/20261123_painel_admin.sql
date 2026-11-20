-- =====================================================================
-- Painel do administrador (/clientes/:slug/painel) + "Tenho interesse" na página do box
--
-- Depende de: schema.sql, 20261118_lock_rpcs.sql, 20261121_login_email.sql (normalize_phone)
--             e 20261122_auto_cadastro.sql (plan_id, financial_status, health_forms).
--
-- O que entra:
--   1. leads + submit_lead()   → formulário público (nome, WhatsApp, interesse, consentimento).
--   2. is_owner(box)           → o painel é só do dono/gestor (role 'owner').
--   3. admin_overview / admin_members / admin_leads / admin_update_lead
--      → números do topo, lista de pessoas (inadimplentes, aniversariantes, interessados,
--        todos) e a gestão dos leads. Tudo security definer com checagem de owner.
--   A ficha de saúde o painel lê direto de health_forms (RLS: só equipe do box).
--   A baixa de pagamento usa a confirm_payment que já existe (só equipe).
--
-- Promover uma conta a administrador (rode no SQL Editor depois que a pessoa criar a
-- conta pelo "Criar conta" da agenda):
--
--   update people p
--      set role = 'owner', plan = null, plan_id = null, due_date = null, financial_status = 'ativo'
--     from auth.users u
--    where u.id = p.auth_user_id and u.email = 'EMAIL_DO_ADMIN'
--      and p.box_id = (select id from boxes where slug = 'icara-training-club');
--   update payments set status = 'cancelado'
--    where status = 'pendente' and person_id in (
--      select p.id from people p join auth.users u on u.id = p.auth_user_id where u.email = 'EMAIL_DO_ADMIN');
--
-- Pode rodar mais de uma vez.
-- =====================================================================


-- =====================================================================
-- 1. Interessados (leads) do formulário público
-- =====================================================================
create table if not exists leads (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references boxes(id) on delete cascade,
  name         text not null check (length(name) between 2 and 120),
  phone        text not null,                       -- E.164 (+55…)
  interest     text check (length(interest) <= 60), -- modalidade / "aula experimental" / livre
  message      text check (length(message) <= 500),
  source       text not null default 'pagina' check (source in ('pagina', 'whatsapp', 'recepcao', 'indicacao')),
  status       text not null default 'novo' check (status in ('novo', 'contatado', 'convertido', 'descartado')),
  notes        text check (length(notes) <= 1000),  -- anotação da recepção
  consent_at   timestamptz not null,                -- LGPD: aceitou ser contatado pelo box
  contacted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists leads_box_created_idx on leads (box_id, created_at desc);
create index if not exists leads_box_phone_idx   on leads (box_id, normalize_phone(phone));

-- Leitura só pelo painel (owner, policy abaixo). Escrita: submit_lead (público) e admin_update_lead.
alter table leads enable row level security;
revoke all on leads from anon, authenticated;
grant select on leads to authenticated;


-- =====================================================================
-- 2. Dono / gestor do box
-- =====================================================================
create or replace function is_owner(p_box uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where box_id = p_box and auth_user_id = auth.uid() and role = 'owner')
$$;

create or replace function _assert_owner(p_box uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if is_trusted_caller() then return; end if;
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  if not is_owner(p_box) then raise exception 'SEM_PERMISSAO'; end if;
end $$;

-- policy de leads (depois de is_owner existir)
drop policy if exists leads_owner_read on leads;
create policy leads_owner_read on leads for select to authenticated using (is_owner(box_id));


-- ---------- formulário público ----------
-- Mesmo WhatsApp nas últimas 24 h: atualiza o pedido em vez de duplicar.
-- Mais de 30 pedidos por hora no box: recusa (formulário sendo abusado).
create or replace function submit_lead(p_box uuid, p_name text, p_phone text, p_interest text default null,
                                       p_message text default null, p_consent boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_name text; v_phone text; v_id uuid;
begin
  if not exists (select 1 from boxes where id = p_box) then raise exception 'BOX_NAO_ENCONTRADO'; end if;
  if not coalesce(p_consent, false) then raise exception 'CONSENTIMENTO_OBRIGATORIO'; end if;

  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'NOME_INVALIDO'; end if;
  v_phone := normalize_phone(p_phone);
  if v_phone is null or length(v_phone) not in (12, 13) then raise exception 'TELEFONE_INVALIDO'; end if;

  select id into v_id from leads
   where box_id = p_box and normalize_phone(phone) = v_phone and created_at > now() - interval '24 hours'
   order by created_at desc limit 1;
  if v_id is not null then
    update leads set name = v_name, interest = coalesce(nullif(left(trim(p_interest), 60), ''), interest),
                     message = coalesce(nullif(left(trim(p_message), 500), ''), message),
                     consent_at = now(), updated_at = now()
     where id = v_id;
    return 'ok';
  end if;

  if (select count(*) from leads where box_id = p_box and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'MUITAS_TENTATIVAS';
  end if;

  insert into leads (box_id, name, phone, interest, message, consent_at)
  values (p_box, v_name, '+' || v_phone, nullif(left(trim(p_interest), 60), ''), nullif(left(trim(p_message), 500), ''), now());
  return 'ok';
end $$;


-- =====================================================================
-- 3. Consultas do painel
-- =====================================================================

-- Números do topo
create or replace function admin_overview(p_box uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare bx boxes; v_today date; r jsonb;
begin
  perform _assert_owner(p_box);
  select * into bx from boxes where id = p_box;
  v_today := (now() at time zone bx.timezone)::date;

  select jsonb_build_object(
    'alunos_ativos',   count(*) filter (where p.role = 'aluno' and billing_status(p.id) = 'pago' and p.financial_status = 'ativo'),
    'carencia',        count(*) filter (where p.role = 'aluno' and billing_status(p.id) = 'carencia'),
    'bloqueados',      count(*) filter (where p.role = 'aluno' and billing_status(p.id) = 'bloqueado'),
    'aguardando_pgto', count(*) filter (where p.financial_status = 'aguardando_pagamento'),
    'experimentais',   count(*) filter (where p.role = 'visitante'),
    'aniversariantes_mes', count(*) filter (where p.birth_date is not null and extract(month from p.birth_date) = extract(month from v_today)),
    'aniversariantes_hoje', count(*) filter (where p.birth_date is not null and is_birthday(p.birth_date, v_today))
  ) into r
  from people p where p.box_id = p_box and not p.is_test and p.role in ('aluno', 'visitante', 'dropin');

  return r || jsonb_build_object(
    'leads_novos', (select count(*) from leads where box_id = p_box and status = 'novo'),
    'a_receber',   (select coalesce(sum(amount), 0) from payments where box_id = p_box and status = 'pendente'),
    'hoje',        v_today
  );
end $$;

-- Todas as pessoas do box com o que o painel precisa (a tela filtra por aba).
create or replace function admin_members(p_box uuid)
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
  classes_30d       int
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
      where b.person_id = p.id and b.status = 'presente' and s.starts_at > now() - interval '30 days')
  from people p
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

-- Leads do formulário, com aviso se o WhatsApp já é de alguém do box
create or replace function admin_leads(p_box uuid)
returns table (id uuid, name text, phone text, interest text, message text, source text, status text,
               notes text, consent_at timestamptz, contacted_at timestamptz, created_at timestamptz,
               member_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_owner(p_box);
  return query
  select l.id, l.name, l.phone, l.interest, l.message, l.source, l.status, l.notes,
         l.consent_at, l.contacted_at, l.created_at,
         (select p.name from people p where p.box_id = l.box_id and normalize_phone(p.phone) = normalize_phone(l.phone) limit 1)
    from leads l
   where l.box_id = p_box
   order by (l.status = 'novo') desc, l.created_at desc;
end $$;

-- Recepção marca o andamento do lead
create or replace function admin_update_lead(p_lead uuid, p_status text, p_notes text default null)
returns leads language plpgsql security definer set search_path = public as $$
declare l leads;
begin
  select * into l from leads where id = p_lead for update;
  if l.id is null then raise exception 'LEAD_NAO_ENCONTRADO'; end if;
  perform _assert_owner(l.box_id);
  if p_status not in ('novo', 'contatado', 'convertido', 'descartado') then raise exception 'STATUS_INVALIDO'; end if;

  update leads set status = p_status,
                   notes = coalesce(nullif(left(trim(p_notes), 1000), ''), notes),
                   contacted_at = case when p_status <> 'novo' then coalesce(contacted_at, now()) end,
                   updated_at = now()
   where id = p_lead returning * into l;
  return l;
end $$;


-- ---------- permissões ----------
revoke execute on function _assert_owner(uuid) from public, anon, authenticated;

revoke execute on function is_owner(uuid) from public, anon;
grant  execute on function is_owner(uuid) to authenticated, service_role;

revoke execute on function submit_lead(uuid, text, text, text, text, boolean) from public;
grant  execute on function submit_lead(uuid, text, text, text, text, boolean) to anon, authenticated, service_role;

revoke execute on function admin_overview(uuid), admin_members(uuid), admin_leads(uuid),
                           admin_update_lead(uuid, text, text)
  from public, anon;
grant  execute on function admin_overview(uuid), admin_members(uuid), admin_leads(uuid),
                           admin_update_lead(uuid, text, text)
  to authenticated, service_role;
