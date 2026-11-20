-- =====================================================================
-- Privacidade dentro da equipe: coach não lê telefone nem financeiro direto das tabelas
--
-- Depende de: 20261118_lock_rpcs.sql (people_read), schema.sql (payments_own)
--             e 20261123_painel_admin.sql (is_owner).
--
-- Antes: people_read e payments_own liberavam a leitura para qualquer pessoa da equipe
-- (is_staff = coach ou owner). A tela do coach escondia, mas uma consulta direta à API
-- (ex.: supabase.from('people').select('phone, due_date')) devolvia telefone, vencimento e
-- status financeiro de todos os alunos — e todas as cobranças do box.
--
-- Depois:
--   • people   → cada um lê o próprio cadastro; o owner lê o box inteiro.
--   • payments → cada um lê as próprias cobranças; o owner lê as do box.
-- O coach continua vendo o que precisa pelas RPCs security definer, que devolvem só
-- o necessário: staff_sessions / staff_people (painel), get_agenda (nome do coach),
-- month_birthdays. A ficha de saúde segue legível pela equipe (health_forms_staff_read),
-- porque é para o coach adaptar o treino.
--
-- Nada no app lê essas tabelas direto como coach (conferido em src/); funções que leem
-- people (mural, reservas, cobrança) são security definer e não passam pelo RLS.
--
-- Pode rodar mais de uma vez.
-- =====================================================================

drop policy if exists people_read on people;
create policy people_read on people for select to authenticated
  using (auth_user_id = auth.uid() or is_owner(box_id));

drop policy if exists payments_own on payments;
create policy payments_own on payments for select to authenticated
  using (person_id in (select id from people where auth_user_id = auth.uid()) or is_owner(box_id));
