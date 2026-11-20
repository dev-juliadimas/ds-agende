-- =====================================================================
-- Login do aluno por e-mail e senha (Supabase Auth) + vínculo com o cadastro do box
--
-- Regra: só cria conta quem o box já cadastrou (tabela people). A ligação
-- conta ↔ aluno é feita pelo TELEFONE que o box tem no cadastro.
--
-- Fluxo:
--   1. Tela "Criar conta": check_signup_phone(box, telefone) avisa antes de criar a
--      conta se o telefone não está cadastrado ou se já tem conta.
--   2. supabase.auth.signUp(e-mail, senha, metadata { box_id, phone }).
--      O Supabase manda o e-mail de confirmação.
--   3. Depois de confirmar e entrar: link_my_account(box) liga auth.uid() ao aluno
--      com aquele telefone (people.auth_user_id).
--
-- Requer no painel do Supabase (Authentication → URL Configuration): o endereço do
-- site (localhost e GitHub Pages) em "Redirect URLs", para os links de confirmação
-- e de redefinição de senha voltarem para a agenda.
--
-- Pode rodar mais de uma vez.
-- =====================================================================

-- Telefone só com dígitos, sempre com 55 na frente (aceita "(48) 99999-0001", "+55 48 ...").
create or replace function normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when d is null or d = '' then null
    when length(d) in (10, 11) then '55' || d
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create index if not exists people_box_phone_norm_idx on people (box_id, normalize_phone(phone));

-- Antes do cadastro: 'ok' | 'nao_cadastrado' | 'ja_tem_conta'
-- (Responde só se o telefone pode criar conta; não devolve nome nem outros dados.)
create or replace function check_signup_phone(p_box uuid, p_phone text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when normalize_phone(p_phone) is null or length(normalize_phone(p_phone)) < 12 then 'nao_cadastrado'
    when not exists (select 1 from people where box_id = p_box and normalize_phone(phone) = normalize_phone(p_phone)
                       and role in ('aluno','coach','owner')) then 'nao_cadastrado'
    when not exists (select 1 from people where box_id = p_box and normalize_phone(phone) = normalize_phone(p_phone)
                       and role in ('aluno','coach','owner') and (auth_user_id is null or is_test)) then 'ja_tem_conta'
    else 'ok' end
$$;

-- Liga a conta logada ao aluno do box com o telefone informado no cadastro
-- (p_phone; se vier nulo, usa o telefone salvo no user_metadata do signUp).
-- Contas anônimas (login de teste) não podem usar esta função.
create or replace function link_my_account(p_box uuid, p_phone text default null)
returns people language plpgsql security definer set search_path = public as $$
declare v_phone text; p people; v_count int;
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'SEM_PERMISSAO'; end if;

  -- já ligado neste box: nada a fazer
  select * into p from people where box_id = p_box and auth_user_id = auth.uid();
  if p.id is not null then return p; end if;

  v_phone := normalize_phone(coalesce(p_phone, auth.jwt() -> 'user_metadata' ->> 'phone'));
  if v_phone is null then raise exception 'TELEFONE_NAO_CADASTRADO'; end if;

  select count(*) into v_count from people
   where box_id = p_box and normalize_phone(phone) = v_phone and role in ('aluno','coach','owner');
  if v_count = 0 then raise exception 'TELEFONE_NAO_CADASTRADO'; end if;

  -- mesmo telefone em mais de um cadastro (ex.: mãe e filho): pega o primeiro ainda sem conta
  select * into p from people
   where box_id = p_box and normalize_phone(phone) = v_phone and role in ('aluno','coach','owner')
     and (auth_user_id is null or is_test)
   order by (auth_user_id is null) desc, created_at
   limit 1
   for update;
  if p.id is null then raise exception 'TELEFONE_JA_TEM_CONTA'; end if;

  -- auth_user_id é único: solta qualquer vínculo anterior desta conta (ex.: aluno de teste)
  update people set auth_user_id = null where auth_user_id = auth.uid() and id <> p.id;
  update people set auth_user_id = auth.uid() where id = p.id returning * into p;
  return p;
end $$;

revoke execute on function check_signup_phone(uuid, text) from public;
grant  execute on function check_signup_phone(uuid, text) to anon, authenticated, service_role;

revoke execute on function link_my_account(uuid, text) from public, anon;
grant  execute on function link_my_account(uuid, text) to authenticated, service_role;
