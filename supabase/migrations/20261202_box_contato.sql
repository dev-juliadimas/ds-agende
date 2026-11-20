-- =====================================================================
-- Contato público do box: endereço, Instagram e WhatsApp
-- Usado pela página pública /clientes/:slug (seção "Contato" no rodapé).
-- Depende de: 20261119_icara_training_club.sql (boxes.slug).
-- Idempotente: pode rodar de novo sem problema.
-- =====================================================================

alter table boxes add column if not exists address       text;
alter table boxes add column if not exists instagram_url text;
alter table boxes add column if not exists whatsapp      text;

alter table boxes drop constraint if exists boxes_instagram_url_check;
alter table boxes add  constraint boxes_instagram_url_check
  check (instagram_url is null or instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9_.]+/?$');

alter table boxes drop constraint if exists boxes_whatsapp_check;
alter table boxes add  constraint boxes_whatsapp_check
  check (whatsapp is null or whatsapp ~ '^55[0-9]{10,11}$');  -- 55 + DDD + número, só dígitos

-- Içara Training Club
update boxes
   set address       = 'Içara Cross, R. Castro Alves, 400 - 1º de Maio, Içara - SC, 88820-000',
       instagram_url = 'https://www.instagram.com/icaratrainingclub/',
       whatsapp      = '554896037332'
 where slug = 'icara-training-club';

-- Leitura sem login: só os campos de contato (boxes tem RLS e não é lido direto pelo anon)
drop function if exists get_box_contact(text);
create function get_box_contact(p_slug text)
returns table (address text, instagram_url text, whatsapp text)
language sql stable security definer set search_path = public as $$
  select b.address, b.instagram_url, b.whatsapp from boxes b where b.slug = p_slug;
$$;

revoke execute on function get_box_contact(text) from public;
grant  execute on function get_box_contact(text) to anon, authenticated, service_role;
