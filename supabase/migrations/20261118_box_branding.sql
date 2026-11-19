-- =====================================================================
-- Identidade visual do box (white-label): cores + logos por cliente
--
-- Cores: brand_primary (ex.: azul marinho do Içara Training Club) e
-- brand_secondary (ex.: dourado). O front troca os tokens de cor do app
-- por estas (ver src/lib/brand.js). O check recusa qualquer coisa fora de #RRGGBB.
--
-- Logos: ficam no Storage, bucket público `assets`, em
--   boxes/<id do box>/logo-{icone,completa,texto,clara,escura}.png
-- O bucket é público e NÃO tem policy de SELECT em storage.objects:
-- as URLs públicas funcionam sem ela, e assim ninguém consegue listar o bucket.
--
-- Leitura: o RLS de `boxes` não deixa visitante ler a tabela. Em vez de abrir
-- a tabela inteira (regras, coordenadas…), a função abaixo devolve só o que
-- a tela precisa antes do login: nome e cores.
-- =====================================================================

alter table boxes
  add column if not exists brand_primary   text check (brand_primary   ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists brand_secondary text check (brand_secondary ~ '^#[0-9a-fA-F]{6}$');

create or replace function get_box_branding(p_box uuid)
returns table (id uuid, name text, brand_primary text, brand_secondary text)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.brand_primary, b.brand_secondary
  from boxes b
  where b.id = p_box
$$;

revoke execute on function get_box_branding(uuid) from public;
grant execute on function get_box_branding(uuid) to anon, authenticated, service_role;
