-- =====================================================================
-- Troca de aula quando o limite semanal do plano já foi atingido
-- (Agenda do Aluno → "Reservar vaga" com 3 de 3 → escolhe qual aula cancelar)
--
-- Cancela uma reserva e reserva a aula nova NA MESMA TRANSAÇÃO: se a reserva nova
-- falhar (turma lotou, plano, etc.), o cancelamento é desfeito e o aluno não perde a vaga.
-- Só troca se o cancelamento estiver no prazo (min_cancel_minutes): fora dele vira
-- 'late_cancel', que continua contando no limite — então a troca não liberaria crédito.
--
-- Depende de: 20261130_cancelamento_tardio.sql (app_cancel_booking) e
--             20261130_regras_plano.sql (app_book_class). Pode rodar mais de uma vez.
-- =====================================================================

create or replace function app_swap_booking(p_cancel uuid, p_session uuid, p_person uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_status booking_status; v_res jsonb;
begin
  select person_id into v_owner from bookings where id = p_cancel;
  if v_owner is null then raise exception 'RESERVA_NAO_ENCONTRADA'; end if;
  if v_owner <> p_person then raise exception 'SEM_PERMISSAO'; end if;

  -- cancel_booking confere que quem chama é o dono da reserva (ou a equipe)
  perform app_cancel_booking(p_cancel);
  select status into v_status from bookings where id = p_cancel;
  if v_status = 'late_cancel' then raise exception 'TROCA_FORA_DO_PRAZO'; end if;

  v_res := app_book_class(p_session, p_person, false);
  return v_res || jsonb_build_object('cancelled_booking', p_cancel);
end $$;

revoke execute on function app_swap_booking(uuid, uuid, uuid) from public, anon;
grant  execute on function app_swap_booking(uuid, uuid, uuid) to authenticated, service_role;
