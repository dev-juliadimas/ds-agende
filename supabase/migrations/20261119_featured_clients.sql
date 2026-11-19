-- =====================================================================
-- Vitrine "Eles já usam" da landing page (rota /)
--
-- Tabela própria, separada de `boxes`: o RLS de `boxes` não deixa visitante
-- ler a tabela (regras, coordenadas, preços), e nem todo cliente da vitrine
-- é um box (manicure, estética…). Aqui só entra o que é público por natureza.
--
-- Leitura: anon e authenticated veem apenas active = true.
-- Escrita: só pelo SQL Editor / service_role (não há policy de insert/update).
--
-- Pode rodar mais de uma vez.
-- =====================================================================

create table if not exists featured_clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 80),
  category      text not null check (length(trim(category)) between 1 and 30), -- selo do card: CrossFit, Pilates, Estética…
  logo_url      text check (logo_url ~ '^https://'),            -- URL pública no Storage; null = monograma com as iniciais
  site_url      text not null check (site_url ~ '^https?://'),  -- só http(s): impede javascript: no href do card
  active        boolean not null default true,
  display_order integer not null default 0,
  -- Opcionais, usados pelo layout atual do card e pelo filtro da seção
  format        text check (format in ('individual', 'coletivo')), -- filtro "Profissionais" / "Turmas"
  subtitle      text,                                               -- ex.: "Box de CrossFit"
  city          text,                                               -- ex.: "Içara • SC"
  created_at    timestamptz not null default now()
);

create index if not exists featured_clients_active_order_idx
  on featured_clients (display_order)
  where active;

alter table featured_clients enable row level security;

drop policy if exists "featured_clients_public_read" on featured_clients;
create policy "featured_clients_public_read"
  on featured_clients
  for select
  to anon, authenticated
  using (active = true);

-- Projetos novos do Supabase não expõem tabelas novas à API automaticamente
revoke all on featured_clients from anon, authenticated;
grant select on featured_clients to anon, authenticated;

-- Exemplo para testar logo após rodar o script
insert into featured_clients (name, category, logo_url, site_url, display_order, format, subtitle, city)
select 'Içara Training Club', 'CrossFit', null, 'https://exemplo.com/icara-training-club', 1,
       'coletivo', 'Box de CrossFit', 'Içara • SC'
where not exists (select 1 from featured_clients where name = 'Içara Training Club');
