-- =====================================================================
-- Contadores de vagas e fila em class_sessions (para o Realtime do front)
--
-- Por quê: o RLS de `bookings` deixa o aluno ver só as próprias reservas,
-- e o Realtime respeita o RLS. Sem isto, a tela do aluno NÃO receberia as
-- reservas dos colegas e as vagas não se atualizariam sozinhas.
-- Com o contador em class_sessions, toda reserva/cancelamento/fila gera um
-- UPDATE nessa tabela, que chega a todas as telas abertas do box.
--
-- Mantém a regra no banco: o front só exibe booked_count / waitlist_count.
-- =====================================================================

alter table class_sessions
  add column if not exists booked_count   int not null default 0,  -- reservado + presente + pre_reserva
  add column if not exists waitlist_count int not null default 0;

create or replace function refresh_session_counters(p_session uuid)
returns void language sql security definer set search_path = public as $$
  update class_sessions s set
    booked_count   = (select count(*) from bookings b where b.session_id = s.id
                       and b.status in ('reservado','presente','pre_reserva')),
    waitlist_count = (select count(*) from waitlist w where w.session_id = s.id)
  where s.id = p_session;
$$;

create or replace function trg_session_counters() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform refresh_session_counters(old.session_id); end if;
  if tg_op in ('INSERT','UPDATE') and (tg_op = 'INSERT' or new.session_id is distinct from old.session_id) then
    perform refresh_session_counters(new.session_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_bookings_counters on bookings;
create trigger trg_bookings_counters after insert or update of status, session_id or delete on bookings
  for each row execute function trg_session_counters();

drop trigger if exists trg_waitlist_counters on waitlist;
create trigger trg_waitlist_counters after insert or delete on waitlist
  for each row execute function trg_session_counters();

-- Preenche os contadores das aulas que já existem
select refresh_session_counters(id) from class_sessions where starts_at > now() - interval '1 day';

-- DELETE no Realtime só traz a PK por padrão; com FULL vem session_id/person_id
-- (o front usa isso para tirar o aluno da fila na hora).
alter table waitlist replica identity full;
