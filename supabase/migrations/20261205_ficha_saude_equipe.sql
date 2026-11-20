-- =====================================================================
-- Ficha de saúde (PAR-Q) legível pela equipe de novo
--
-- Depois de 20261126_rls_privacidade_equipe.sql o coach só lê a PRÓPRIA linha de people.
-- A policy health_forms_staff_read fazia "exists (select ... from people p ...)", e essa
-- subconsulta roda com o RLS do coach → ele deixou de ver a ficha dos alunos no painel.
--
-- Agora o box da pessoa vem de uma função security definer (não passa pelo RLS de people),
-- e o coach continua sem ler telefone/financeiro direto da tabela.
-- Pode rodar mais de uma vez.
-- =====================================================================

create or replace function _person_box(p_person uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select box_id from people where id = p_person
$$;
revoke execute on function _person_box(uuid) from public, anon;
grant  execute on function _person_box(uuid) to authenticated, service_role;

drop policy if exists health_forms_staff_read on health_forms;
create policy health_forms_staff_read on health_forms for select to authenticated
  using (is_staff(_person_box(person_id)));
