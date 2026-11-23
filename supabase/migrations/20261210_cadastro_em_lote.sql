-- =====================================================================
-- Cadastro em lote e pré-cadastro de alunos pelo administrador do box
--
-- Depende de: 20261121_login_email.sql (normalize_phone), 20261123_painel_admin.sql
--             (_assert_owner), 20261130_super_admin.sql (profiles) e schema.sql (pgcrypto).
--
-- Para migrar a base de clientes que o box já tem. O administrador cadastra um aluno
-- (Nome, E-mail e CPF ou WhatsApp) ou cola/sobe uma planilha. O banco cria a conta de
-- login já confirmada, com senha provisória:
--   • CPF só com números (ex.: 12345678900), ou
--   • WhatsApp com DDD, só números, sem o 55 (ex.: 48999990001), se não houver CPF.
-- profiles.must_change_password = true: no 1º login o app pede uma senha nova antes de
-- liberar a agenda. "Resetar senha" volta a senha para o CPF/WhatsApp e liga a flag de novo.
--
--   • people.phone deixa de ser obrigatório (aluno só com CPF) e ganha people.cpf
--     (11 dígitos, único por box). O RLS de people já limita a leitura ao próprio aluno
--     e ao owner (20261126_rls_privacidade_equipe.sql); nenhuma RPC devolve o CPF inteiro.
--   • admin_import_students(box, linhas, dry_run): com dry_run = true só confere (prévia);
--     com false cria as contas. Uma linha com erro não impede as outras.
--   • admin_reset_student_password(box, pessoa)
--   • my_must_change_password() / finish_first_access(): tela "Definir nova senha"
--   • admin_student_access(box): flag e se dá para resetar, para a lista de alunos
--
-- Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- colunas ----------
alter table people alter column phone drop not null;
alter table people add column if not exists cpf text;

do $$ begin
  alter table people add constraint people_cpf_digits_chk check (cpf is null or cpf ~ '^\d{11}$');
exception when duplicate_object then null; end $$;

create unique index if not exists people_box_cpf_uq on people (box_id, cpf) where cpf is not null;

alter table profiles add column if not exists must_change_password boolean not null default false;

-- ---------- CPF e senha provisória ----------
-- Só dígitos; null se vazio. "123.456.789-00" → "12345678900"
create or replace function normalize_cpf(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

-- Dígitos verificadores do CPF (rejeita "111.111.111-11" e afins)
create or replace function is_valid_cpf(p text) returns boolean
language plpgsql immutable as $$
declare d text := normalize_cpf(p); s int; r int; i int;
begin
  if d is null or length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- Senha provisória: CPF; sem CPF, DDD + número (sem o 55). null se não houver nenhum.
create or replace function _provisional_password(p_cpf text, p_phone text) returns text
language sql immutable as $$
  select coalesce(
    normalize_cpf(p_cpf),
    case when normalize_phone(p_phone) ~ '^55\d{10,11}$' then substr(normalize_phone(p_phone), 3) end
  )
$$;
revoke execute on function _provisional_password(text, text) from public, anon, authenticated;

-- ---------- importação (individual ou em lote) ----------
-- p_rows: [{ "name": "...", "email": "...", "cpf": "...", "phone": "..." }, ...] (até 500)
-- result: 'novo' (cria aluno e conta) | 'vincular' (aluno já está no box sem conta: cria só a conta)
--       | 'erro' (error_code diz o motivo) | 'criado' / 'vinculado' (depois de gravar)
-- password_source: 'cpf' | 'telefone' — qual dado virou a senha provisória
create or replace function admin_import_students(p_box uuid, p_rows jsonb, p_dry_run boolean default true)
returns table (
  row_index       int,
  row_name        text,
  row_email       text,
  result          text,
  error_code      text,
  password_source text,
  person_id       uuid,
  warning         text
)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  r jsonb; i int := 0;
  v_name text; v_email text; v_cpf text; v_phone text; v_phone_raw text; v_pass text;
  v_seen_email text[] := '{}'; v_seen_cpf text[] := '{}'; v_seen_phone text[] := '{}';
  v_match people; v_n int; v_uid uuid; v_instance uuid; v_code text; v_warn text; v_pid uuid; v_cons text;
begin
  perform _assert_owner(p_box);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'LISTA_INVALIDA'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'LISTA_VAZIA'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'LISTA_GRANDE'; end if;

  select u.instance_id into v_instance from auth.users u where u.instance_id is not null limit 1;
  v_instance := coalesce(v_instance, '00000000-0000-0000-0000-000000000000');

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_code := null; v_warn := null; v_match := null; v_pid := null;
    v_name := regexp_replace(btrim(coalesce(r ->> 'name', '')), '\s+', ' ', 'g');
    v_email := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
    v_cpf := normalize_cpf(r ->> 'cpf');
    v_phone_raw := nullif(regexp_replace(coalesce(r ->> 'phone', ''), '\D', '', 'g'), '');
    v_phone := normalize_phone(r ->> 'phone');

    -- 1. dados da linha
    if length(v_name) < 3 or length(v_name) > 80 or position(' ' in v_name) = 0 then v_code := 'NOME_INVALIDO';
    elsif v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then v_code := 'EMAIL_INVALIDO';
    elsif v_cpf is not null and not is_valid_cpf(v_cpf) then v_code := 'CPF_INVALIDO';
    elsif v_phone_raw is not null and (v_phone is null or v_phone !~ '^55\d{10,11}$') then v_code := 'TELEFONE_INVALIDO';
    elsif v_cpf is null and v_phone_raw is null then v_code := 'SEM_CPF_TELEFONE';
    -- 2. repetido dentro da própria lista
    elsif v_email = any (v_seen_email) then v_code := 'EMAIL_REPETIDO_LISTA';
    elsif v_cpf is not null and v_cpf = any (v_seen_cpf) then v_code := 'CPF_REPETIDO_LISTA';
    -- 3. e-mail que já tem conta (em qualquer box: o login é um só)
    elsif exists (select 1 from auth.users u where lower(u.email) = v_email) then v_code := 'EMAIL_EM_USO';
    end if;

    if v_phone_raw is null then v_phone := null; end if;

    -- 4. já está no cadastro do box? Pelo CPF, ou pelo WhatsApp + mesmo nome
    --    (WhatsApp sozinho não basta: mãe e filho podem dividir o número)
    if v_code is null then
      select count(distinct p.id) into v_n from people p
       where p.box_id = p_box and not p.is_test
         and ((v_cpf is not null and p.cpf = v_cpf)
           or (v_phone is not null and normalize_phone(p.phone) = v_phone and lower(p.name) = lower(v_name)));
      if v_n > 1 then
        v_code := 'CADASTRO_AMBIGUO';
      elsif v_n = 1 then
        select p.* into v_match from people p
         where p.box_id = p_box and not p.is_test
           and ((v_cpf is not null and p.cpf = v_cpf)
             or (v_phone is not null and normalize_phone(p.phone) = v_phone and lower(p.name) = lower(v_name)));
        if v_match.role in ('owner', 'coach') then v_code := 'E_DA_EQUIPE';
        elsif v_match.auth_user_id is not null then v_code := 'JA_TEM_CONTA';
        elsif v_cpf is not null and v_match.cpf is not null and v_match.cpf <> v_cpf then v_code := 'CPF_DIFERENTE';
        end if;
      elsif v_phone is not null and exists (select 1 from people p where p.box_id = p_box and normalize_phone(p.phone) = v_phone) then
        v_warn := 'TELEFONE_COMPARTILHADO';
      end if;
    end if;

    if v_phone is not null and v_phone = any (v_seen_phone) and v_code is null then v_warn := 'TELEFONE_COMPARTILHADO'; end if;

    v_seen_email := v_seen_email || v_email;
    if v_cpf is not null then v_seen_cpf := v_seen_cpf || v_cpf; end if;
    if v_phone is not null then v_seen_phone := v_seen_phone || v_phone; end if;

    row_index := i; row_name := v_name; row_email := v_email; warning := v_warn;
    password_source := case when v_cpf is not null then 'cpf' when v_phone is not null then 'telefone' end;
    person_id := v_match.id;

    if v_code is not null then
      result := 'erro'; error_code := v_code; password_source := null; person_id := null;
      return next; continue;
    end if;

    error_code := null;
    if p_dry_run then
      result := case when v_match.id is not null then 'vincular' else 'novo' end;
      return next; continue;
    end if;

    -- 5. grava: conta (auth.users + identidade de e-mail), cadastro e flag de 1º acesso.
    --    Cada linha numa subtransação: se der erro, só ela volta.
    begin
      v_uid := gen_random_uuid();
      v_pass := _provisional_password(v_cpf, v_phone);

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        v_instance, v_uid, 'authenticated', 'authenticated', v_email, crypt(v_pass, gen_salt('bf')), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', v_name, 'box_id', p_box, 'created_by_admin', true),
        now(), now(), '', '', '', ''
      );

      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        gen_random_uuid(), v_uid, v_uid::text,
        jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
        'email', null, now(), now()
      );

      if v_match.id is not null then
        update people p set
          auth_user_id = v_uid,
          cpf = coalesce(p.cpf, v_cpf),
          phone = coalesce(p.phone, '+' || v_phone)
        where p.id = v_match.id
        returning p.id into v_pid;
      else
        insert into people (box_id, auth_user_id, name, phone, cpf, role)
        values (p_box, v_uid, v_name, case when v_phone is not null then '+' || v_phone end, v_cpf, 'aluno')
        returning id into v_pid;
      end if;

      insert into profiles (user_id, must_change_password) values (v_uid, true)
      on conflict (user_id) do update set must_change_password = true;

      result := case when v_match.id is not null then 'vinculado' else 'criado' end;
      person_id := v_pid;
    exception
      when unique_violation then
        get stacked diagnostics v_cons = constraint_name;
        result := 'erro'; password_source := null; person_id := null;
        error_code := case when v_cons ilike '%email%' then 'EMAIL_EM_USO' else 'CADASTRO_DUPLICADO' end;
      when others then
        result := 'erro'; error_code := 'ERRO_AO_CRIAR'; password_source := null; person_id := null;
        raise warning 'admin_import_students linha %: %', i, sqlerrm;
    end;
    return next;
  end loop;
end $$;

-- ---------- resetar senha para o CPF/WhatsApp ----------
-- Devolve 'cpf' ou 'telefone'. Só para alunos (nunca equipe nem super admin) e só se a
-- conta não for usada em outro box — senão o admin de um box poderia entrar na conta
-- de alguém em outro box. Encerra as sessões abertas da conta.
create or replace function admin_reset_student_password(p_box uuid, p_person uuid)
returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare p people; v_pass text;
begin
  perform _assert_owner(p_box);
  select * into p from people where id = p_person and box_id = p_box;
  if p.id is null then raise exception 'ALUNO_NAO_ENCONTRADO'; end if;
  if p.role in ('owner', 'coach') or p.is_test then raise exception 'RESET_SO_ALUNO'; end if;
  if p.auth_user_id is null then raise exception 'ALUNO_SEM_CONTA'; end if;
  if exists (select 1 from people x where x.auth_user_id = p.auth_user_id and (x.role in ('owner', 'coach') or x.box_id <> p_box))
     or exists (select 1 from profiles f where f.user_id = p.auth_user_id and f.is_super_admin) then
    raise exception 'CONTA_EM_OUTRO_BOX';
  end if;

  v_pass := _provisional_password(p.cpf, p.phone);
  if v_pass is null then raise exception 'SEM_CPF_TELEFONE'; end if;

  update auth.users set encrypted_password = crypt(v_pass, gen_salt('bf')), updated_at = now()
   where id = p.auth_user_id;
  -- quem estava logado (ou descobriu a senha antiga) sai
  delete from auth.sessions where user_id = p.auth_user_id;

  insert into profiles (user_id, must_change_password) values (p.auth_user_id, true)
  on conflict (user_id) do update set must_change_password = true;

  return case when normalize_cpf(p.cpf) is not null then 'cpf' else 'telefone' end;
end $$;

-- ---------- primeiro acesso ----------
create or replace function my_must_change_password() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select f.must_change_password from profiles f where f.user_id = auth.uid()), false)
$$;

-- Chamada depois de supabase.auth.updateUser({ password }). Confere que a senha da conta
-- não é mais a provisória antes de desligar a flag.
create or replace function finish_first_access() returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_hash text;
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  select encrypted_password into v_hash from auth.users where id = auth.uid();
  if v_hash is not null and exists (
    select 1 from people p
     where p.auth_user_id = auth.uid()
       and _provisional_password(p.cpf, p.phone) is not null
       and v_hash = crypt(_provisional_password(p.cpf, p.phone), v_hash)
  ) then
    raise exception 'SENHA_PROVISORIA';
  end if;
  update profiles set must_change_password = false where user_id = auth.uid();
end $$;

-- ---------- lista de alunos: situação do acesso ----------
create or replace function admin_student_access(p_box uuid)
returns table (person_id uuid, has_cpf boolean, must_change_password boolean, can_reset boolean, reset_source text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_owner(p_box);
  return query
  select
    p.id,
    p.cpf is not null,
    coalesce(f.must_change_password, false),
    p.auth_user_id is not null and p.role not in ('owner', 'coach') and not p.is_test
      and _provisional_password(p.cpf, p.phone) is not null
      and not exists (select 1 from people x where x.auth_user_id = p.auth_user_id and (x.role in ('owner', 'coach') or x.box_id <> p_box))
      and not coalesce(f.is_super_admin, false),
    case when p.cpf is not null then 'cpf' when _provisional_password(null, p.phone) is not null then 'telefone' end
  from people p
  left join profiles f on f.user_id = p.auth_user_id
  where p.box_id = p_box;
end $$;

-- ---------- permissões ----------
revoke execute on function
  admin_import_students(uuid, jsonb, boolean),
  admin_reset_student_password(uuid, uuid),
  admin_student_access(uuid),
  my_must_change_password(),
  finish_first_access()
from public, anon;
grant execute on function
  admin_import_students(uuid, jsonb, boolean),
  admin_reset_student_password(uuid, uuid),
  admin_student_access(uuid),
  my_must_change_password(),
  finish_first_access()
to authenticated, service_role;
