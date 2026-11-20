-- =====================================================================
-- Treino do Dia (WOD) por data e modalidade
--
--   • Coach/owner lança no Painel → aba "Treino" (src/painel/WodGestao.jsx)
--   • Aluno vê dentro do card da aula na Agenda (src/agenda/AgendaAluno.jsx)
--
-- `modality` guarda o código da modalidade (modalities.code: CROSS, HYROX…),
-- o mesmo que get_agenda devolve em modality_code. A FK composta garante que
-- o código exista no box (e acompanha uma renomeação do código).
-- Substitui a tabela de protótipo `wods` (um treino por dia, sem modalidade).
-- =====================================================================

create table if not exists daily_wods (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid not null references boxes(id) on delete cascade,
  wod_date    date not null,
  modality    text not null,
  title       text not null check (length(trim(title)) between 1 and 80),
  description text check (length(description) <= 4000),
  created_by  uuid references people(id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (box_id, wod_date, modality),
  foreign key (box_id, modality) references modalities(box_id, code) on update cascade on delete cascade
);

create index if not exists daily_wods_box_date on daily_wods (box_id, wod_date);

-- autoria e data da última edição ficam a cargo do banco
create or replace function daily_wods_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce((my_person(new.box_id)).id, new.created_by);
  else
    new.created_by := old.created_by;
    new.box_id := old.box_id; -- treino não muda de box
  end if;
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  return new;
end $$;

drop trigger if exists daily_wods_before_write on daily_wods;
create trigger daily_wods_before_write before insert or update on daily_wods
  for each row execute function daily_wods_before_write();

-- ---------- Acesso: alunos do box leem; coach/owner lançam, editam e apagam ----------
alter table daily_wods enable row level security;

drop policy if exists daily_wods_read on daily_wods;
create policy daily_wods_read on daily_wods for select to authenticated
  using (is_member(box_id));

drop policy if exists daily_wods_insert on daily_wods;
create policy daily_wods_insert on daily_wods for insert to authenticated
  with check (is_staff(box_id));

drop policy if exists daily_wods_update on daily_wods;
create policy daily_wods_update on daily_wods for update to authenticated
  using (is_staff(box_id)) with check (is_staff(box_id));

drop policy if exists daily_wods_delete on daily_wods;
create policy daily_wods_delete on daily_wods for delete to authenticated
  using (is_staff(box_id));

revoke all on daily_wods from anon, authenticated;
grant select, insert, update, delete on daily_wods to authenticated;
revoke execute on function daily_wods_before_write() from public, anon, authenticated;

-- Realtime: a Agenda do aluno recarrega o treino quando a equipe publica/edita (src/agenda/useWods.js)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'daily_wods') then
    alter publication supabase_realtime add table daily_wods;
  end if;
exception when undefined_object then
  raise notice 'publicação supabase_realtime não existe (banco fora do Supabase).';
end $$;
