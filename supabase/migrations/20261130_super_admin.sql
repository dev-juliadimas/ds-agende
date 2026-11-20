-- =====================================================================
-- Super Admin do DS Agende (/super-admin): gerenciar os clientes (boxes)
--
-- Depende de: 20261118_lock_rpcs.sql (is_trusted_caller, caller_person),
--             20261119_icara_training_club.sql (boxes.slug),
--             20261120_agenda_aluno.sql (get_box_public, test_login_enabled),
--             20261123_painel_admin.sql (is_owner),
--             20261128_comunidade_whatsapp.sql (boxes.whatsapp_community_url).
--
--   • profiles.is_super_admin: flag por usuário do Auth. Só se liga pelo SQL Editor:
--       insert into profiles (user_id, is_super_admin)
--       select id, true from auth.users where email = '<seu e-mail>'
--       on conflict (user_id) do update set is_super_admin = true;
--   • boxes ganha: category, is_active, logo_light_url, logo_dark_url
--   • Cliente inativo (ex.: inadimplência do SaaS): is_member / is_staff / is_owner /
--     caller_person passam a devolver falso/null → o RLS e as RPCs param de liberar
--     dados para alunos e equipe desse box. get_box_public devolve is_active para a
--     tela mostrar "acesso suspenso".
--   • RPCs sa_*: só para super admin (ou SQL Editor / service_role).
--
-- Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- flag de super admin ----------
create table if not exists profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table profiles enable row level security;

-- cada um lê só a própria linha; ninguém escreve pela API (só SQL Editor / service_role)
drop policy if exists "profiles_read_own" on profiles;
create policy "profiles_read_own" on profiles for select to authenticated using (user_id = auth.uid());

revoke all on profiles from anon, authenticated;
grant select on profiles to authenticated;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_super_admin from profiles p where p.user_id = auth.uid()), false)
$$;

create or replace function _assert_super_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if is_trusted_caller() then return; end if;
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;
  if not is_super_admin() then raise exception 'SEM_PERMISSAO'; end if;
end $$;


-- ---------- colunas novas em boxes ----------
alter table boxes
  add column if not exists category       text,
  add column if not exists is_active      boolean not null default true,
  add column if not exists logo_light_url text,   -- logo para fundo claro (escura)
  add column if not exists logo_dark_url  text;   -- logo para fundo escuro (clara)

alter table boxes drop constraint if exists boxes_category_check;
alter table boxes add constraint boxes_category_check
  check (category is null or length(btrim(category)) between 1 and 30);
alter table boxes drop constraint if exists boxes_slug_format_check;
alter table boxes add constraint boxes_slug_format_check
  check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
alter table boxes drop constraint if exists boxes_logo_urls_check;
alter table boxes add constraint boxes_logo_urls_check
  check ((logo_light_url is null or logo_light_url ~ '^https://')
     and (logo_dark_url  is null or logo_dark_url  ~ '^https://'));


-- ---------- box inativo: equipe e alunos perdem o acesso ----------
create or replace function is_member(p_box uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p join boxes b on b.id = p.box_id
                  where p.box_id = p_box and p.auth_user_id = auth.uid() and b.is_active)
$$;

create or replace function is_staff(p_box uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p join boxes b on b.id = p.box_id
                  where p.box_id = p_box and p.auth_user_id = auth.uid() and p.role in ('owner','coach') and b.is_active)
$$;

create or replace function is_owner(p_box uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people p join boxes b on b.id = p.box_id
                  where p.box_id = p_box and p.auth_user_id = auth.uid() and p.role = 'owner' and b.is_active)
$$;

create or replace function caller_person(p_box uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from people p join boxes b on b.id = p.box_id
   where p.box_id = p_box and p.auth_user_id = auth.uid() and b.is_active limit 1
$$;

-- tela antes do login: agora com is_active e as URLs das logos
drop function if exists get_box_public(text);
create function get_box_public(p_slug text)
returns table (id uuid, slug text, name text, brand_primary text, brand_secondary text,
               min_cancel_minutes int, book_ahead_days int, test_login_enabled boolean,
               is_active boolean, category text, logo_light_url text, logo_dark_url text)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.brand_primary, b.brand_secondary,
         b.min_cancel_minutes, b.book_ahead_days, b.test_login_enabled and b.is_active,
         b.is_active, b.category, b.logo_light_url, b.logo_dark_url
    from boxes b where b.slug = p_slug
$$;


-- ---------- RPCs do super admin ----------
create or replace function sa_list_boxes()
returns table (id uuid, name text, slug text, category text, is_active boolean,
               brand_primary text, brand_secondary text, logo_light_url text, logo_dark_url text,
               whatsapp_community_url text, alunos int, equipe int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_super_admin();
  return query
  select b.id, b.name, b.slug, b.category, b.is_active,
         b.brand_primary, b.brand_secondary, b.logo_light_url, b.logo_dark_url,
         b.whatsapp_community_url,
         (select count(*)::int from people p where p.box_id = b.id and p.role = 'aluno' and not coalesce(p.is_test, false)),
         (select count(*)::int from people p where p.box_id = b.id and p.role in ('owner','coach') and not coalesce(p.is_test, false)),
         b.created_at
    from boxes b
   order by b.is_active desc, b.name;
end $$;

-- p_id null → cria; senão edita. Devolve o id.
create or replace function sa_upsert_box(
  p_id uuid, p_name text, p_slug text, p_category text,
  p_primary text, p_secondary text,
  p_logo_light text, p_logo_dark text, p_community text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_cat  text := nullif(btrim(coalesce(p_category, '')), '');
  v_p    text := nullif(btrim(coalesce(p_primary, '')), '');
  v_s    text := nullif(btrim(coalesce(p_secondary, '')), '');
  v_ll   text := nullif(btrim(coalesce(p_logo_light, '')), '');
  v_ld   text := nullif(btrim(coalesce(p_logo_dark, '')), '');
  v_wa   text := nullif(btrim(coalesce(p_community, '')), '');
begin
  perform _assert_super_admin();

  if length(v_name) not between 2 and 80 then raise exception 'NOME_CLIENTE_INVALIDO'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 60 then raise exception 'SLUG_INVALIDO'; end if;
  if exists (select 1 from boxes where slug = v_slug and id is distinct from p_id) then raise exception 'SLUG_EM_USO'; end if;
  if (v_p is not null and v_p !~ '^#[0-9a-fA-F]{6}$') or (v_s is not null and v_s !~ '^#[0-9a-fA-F]{6}$') then
    raise exception 'COR_INVALIDA';
  end if;
  if (v_ll is not null and v_ll !~ '^https://') or (v_ld is not null and v_ld !~ '^https://') then
    raise exception 'URL_LOGO_INVALIDA';
  end if;
  if v_wa is not null then
    v_wa := regexp_replace(v_wa, '[?#].*$', '');
    if v_wa !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$' then raise exception 'LINK_COMUNIDADE_INVALIDO'; end if;
  end if;

  if p_id is null then
    insert into boxes (name, slug, category, brand_primary, brand_secondary, logo_light_url, logo_dark_url, whatsapp_community_url)
    values (v_name, v_slug, v_cat, lower(v_p), lower(v_s), v_ll, v_ld, v_wa)
    returning id into v_id;
  else
    update boxes set name = v_name, slug = v_slug, category = v_cat,
                     brand_primary = lower(v_p), brand_secondary = lower(v_s),
                     logo_light_url = v_ll, logo_dark_url = v_ld, whatsapp_community_url = v_wa
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'BOX_NAO_ENCONTRADO'; end if;
  end if;
  return v_id;
end $$;

create or replace function sa_set_box_active(p_box uuid, p_active boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  perform _assert_super_admin();
  update boxes set is_active = coalesce(p_active, true) where id = p_box returning is_active into v;
  if v is null then raise exception 'BOX_NAO_ENCONTRADO'; end if;
  return v;
end $$;


-- ---------- permissões ----------
revoke execute on function _assert_super_admin() from public, anon, authenticated;
revoke execute on function is_super_admin(), sa_list_boxes(),
  sa_upsert_box(uuid, text, text, text, text, text, text, text, text), sa_set_box_active(uuid, boolean)
  from public, anon;
grant execute on function is_super_admin(), sa_list_boxes(),
  sa_upsert_box(uuid, text, text, text, text, text, text, text, text), sa_set_box_active(uuid, boolean)
  to authenticated, service_role;

revoke execute on function get_box_public(text) from public;
grant  execute on function get_box_public(text) to anon, authenticated, service_role;
