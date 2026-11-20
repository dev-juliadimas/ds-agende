-- =====================================================================
-- Mural do Box (avisos) — aluno lê, equipe publica
--
-- Depende de: schema.sql (notices, whatsapp_outbox, is_member, is_staff),
--             20261118_lock_rpcs.sql (is_trusted_caller, caller_person),
--             20261124_painel_coach.sql (_assert_staff).
--
-- O que muda em `notices` (a tabela já existia no schema.sql, sem uso no app real):
--   • categorias novas: geral · urgente · evento · horario
--     (feriado/aulao/desafio continuam aceitas para os avisos antigos)
--   • send_whatsapp: o coach pediu o alerta no WhatsApp
--   • created_by (era author_id) + author_name: o aluno não lê `people` pelo RLS,
--     então o nome de quem publicou fica gravado no próprio aviso
--   • updated_at
-- Regras (trigger notices_before_write, não dá para burlar pelo cliente):
--   • created_by / author_name / box_id vêm do usuário logado, não do que o app manda
--   • whatsapp_sent_at / whatsapp_recipients só o banco escreve
--   • send_whatsapp = true (ao criar, ou ao ligar depois na edição) e boxes.dispatch_urgent
--     ligado → 1 linha por aluno em whatsapp_outbox (kind 'urgent', custo 'utilidade').
--     Só dispara uma vez por aviso; editar o texto não reenvia.
-- RLS: membro do box lê; owner/coach cria, edita e exclui.
-- Realtime: notices já está na publicação no schema.sql; garantido abaixo.
--
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table boxes add column if not exists dispatch_urgent boolean not null default true;

-- ---------- colunas ----------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notices' and column_name = 'author_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notices' and column_name = 'created_by') then
    alter table notices rename column author_id to created_by;
  end if;
end $$;

alter table notices add column if not exists created_by    uuid references people(id) on delete set null;
alter table notices add column if not exists author_name   text;
alter table notices add column if not exists send_whatsapp boolean not null default false;
alter table notices add column if not exists updated_at    timestamptz not null default now();
alter table notices add column if not exists whatsapp_sent_at    timestamptz;
alter table notices add column if not exists whatsapp_recipients int;

update notices set category = 'geral' where category is null;
update notices set pinned = false where pinned is null;
update notices set created_at = now() where created_at is null;

alter table notices alter column box_id     set not null;
alter table notices alter column category   set default 'geral';
alter table notices alter column category   set not null;
alter table notices alter column pinned     set default false;
alter table notices alter column pinned     set not null;
alter table notices alter column created_at set default now();
alter table notices alter column created_at set not null;

alter table notices drop constraint if exists notices_category_check;
alter table notices add constraint notices_category_check
  check (category in ('geral', 'urgente', 'evento', 'horario', 'feriado', 'aulao', 'desafio'));

alter table notices drop constraint if exists notices_title_len;
alter table notices add constraint notices_title_len check (char_length(btrim(title)) between 1 and 120);
alter table notices drop constraint if exists notices_body_len;
alter table notices add constraint notices_body_len check (body is null or char_length(body) <= 2000);

-- exclusão do box apaga o mural
alter table notices drop constraint if exists notices_box_id_fkey;
alter table notices add constraint notices_box_id_fkey foreign key (box_id) references boxes(id) on delete cascade;

-- mural: fixados primeiro, depois os mais novos
create index if not exists notices_feed_idx on notices (box_id, pinned desc, created_at desc);


-- ---------- quem recebe o alerta urgente ----------
-- Alunos e drop-ins ativos do box (sem bloqueados e sem contas de teste).
create or replace function _urgent_recipients(p_box uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from people p
   where p.box_id = p_box
     and p.role in ('aluno', 'dropin')
     and p.blocked_at is null
     and not coalesce(p.is_test, false)
     and nullif(btrim(p.phone), '') is not null
$$;


-- ---------- trigger: autoria, campos protegidos e fila do WhatsApp ----------
create or replace function notices_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_me people; v_on boolean; v_n int;
begin
  new.title := btrim(new.title);
  new.body  := nullif(btrim(coalesce(new.body, '')), '');

  if tg_op = 'INSERT' then
    if not is_trusted_caller() then
      select * into v_me from people where box_id = new.box_id and auth_user_id = auth.uid() limit 1;
      new.created_by  := v_me.id;
      new.author_name := v_me.name;
    elsif new.author_name is null and new.created_by is not null then
      select name into new.author_name from people where id = new.created_by;
    end if;
    new.created_at := now();
    new.whatsapp_sent_at := null;
    new.whatsapp_recipients := null;
  else
    -- quem publicou, o box e o histórico de envio não mudam pela edição
    new.box_id := old.box_id;
    new.created_by := old.created_by;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    new.whatsapp_sent_at := old.whatsapp_sent_at;
    new.whatsapp_recipients := old.whatsapp_recipients;
  end if;
  new.updated_at := now();

  -- alerta urgente: ao criar com o toggle ligado, ou ao ligar o toggle numa edição
  if new.send_whatsapp and new.whatsapp_sent_at is null
     and (tg_op = 'INSERT' or not old.send_whatsapp) then
    select dispatch_urgent into v_on from boxes where id = new.box_id;
    if coalesce(v_on, false) then
      insert into whatsapp_outbox (box_id, person_id, kind, meta_category, payload)
      select new.box_id, r, 'urgent', 'utilidade',
             jsonb_build_object('template', 'aviso_urgente', 'notice_id', new.id,
                                'title', new.title, 'body', new.body, 'category', new.category)
        from _urgent_recipients(new.box_id) r;
      get diagnostics v_n = row_count;
      new.whatsapp_sent_at := now();
      new.whatsapp_recipients := v_n;
    else
      new.whatsapp_recipients := 0; -- pedido, mas o disparo está desligado no box
    end if;
  end if;
  return new;
end $$;

drop trigger if exists notices_before_write on notices;
create trigger notices_before_write before insert or update on notices
  for each row execute function notices_before_write();


-- ---------- RLS ----------
alter table notices enable row level security;

drop policy if exists notices_read   on notices;
drop policy if exists notices_insert on notices;
drop policy if exists notices_update on notices;
drop policy if exists notices_delete on notices;

create policy notices_read   on notices for select to authenticated using (is_member(box_id));
create policy notices_insert on notices for insert to authenticated with check (is_staff(box_id));
create policy notices_update on notices for update to authenticated using (is_staff(box_id)) with check (is_staff(box_id));
create policy notices_delete on notices for delete to authenticated using (is_staff(box_id));

grant select, insert, update, delete on notices to authenticated;
revoke all on notices from anon;


-- ---------- Realtime ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notices') then
    alter publication supabase_realtime add table notices;
  end if;
end $$;


-- ---------- info para o formulário do coach ----------
-- Disparo ligado? Quantos alunos receberiam? (o app calcula o custo estimado)
create or replace function notice_dispatch_info(p_box uuid)
returns table (dispatch_urgent boolean, recipients int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_staff(p_box);
  return query
  select coalesce(b.dispatch_urgent, false), (select count(*)::int from _urgent_recipients(p_box))
    from boxes b where b.id = p_box;
end $$;


-- ---------- permissões ----------
revoke execute on function _urgent_recipients(uuid) from public, anon, authenticated;
revoke execute on function notices_before_write() from public, anon, authenticated;
revoke execute on function notice_dispatch_info(uuid) from public, anon;
grant  execute on function notice_dispatch_info(uuid) to authenticated, service_role;
