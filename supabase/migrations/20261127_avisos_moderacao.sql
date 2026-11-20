-- =====================================================================
-- Mural do Box: moderação dos avisos pelo administrador
--
-- Depende de: 20261125_mural_avisos.sql (notices, trigger, _urgent_recipients),
--             20261123_painel_admin.sql (is_owner, _assert_owner),
--             20261124_painel_coach.sql (_assert_staff).
--
-- Regra:
--   • Aviso do administrador (owner) → publicado na hora.
--   • Aviso de coach com people.can_publish_notices_directly = true → publicado na hora.
--   • Aviso dos demais coaches → 'pending', até o administrador aprovar ou recusar.
--   • Só o administrador muda o status (aprovar / recusar). Coach que edita uma
--     solicitação recusada reenvia para aprovação ('rejected' → 'pending').
--   • O alerta no WhatsApp só entra na whatsapp_outbox quando o aviso fica 'published'
--     (na criação direta ou na aprovação). Nunca enquanto está pendente ou recusado.
--   • published_at: quando o aviso entrou no mural (aprovado ontem aparece como novo hoje).
--
-- RLS de notices:
--   SELECT  aluno: só 'published' · coach: 'published' + os próprios · admin: tudo do box
--   INSERT  equipe (o trigger decide o status)
--   UPDATE  admin: tudo · coach: as próprias solicitações não publicadas;
--           os publicados só se tiver publicação direta
--   DELETE  igual ao UPDATE
-- Realtime: o aluno só recebe o UPDATE da aprovação porque o RLS passa a deixar ele ler a linha.
--
-- Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- colunas ----------
alter table people add column if not exists can_publish_notices_directly boolean not null default false;

-- avisos que já existiam estavam no mural: entram como publicados
alter table notices add column if not exists status text not null default 'published';
alter table notices alter column status set default 'pending';
alter table notices drop constraint if exists notices_status_check;
alter table notices add constraint notices_status_check check (status in ('pending', 'published', 'rejected'));

alter table notices add column if not exists reviewed_by      uuid references people(id) on delete set null;
alter table notices add column if not exists reviewed_at      timestamptz;
alter table notices add column if not exists rejection_reason text;
alter table notices add column if not exists published_at     timestamptz;

alter table notices drop constraint if exists notices_rejection_len;
alter table notices add constraint notices_rejection_len check (rejection_reason is null or char_length(rejection_reason) <= 500);

update notices set published_at = created_at where status = 'published' and published_at is null;

drop index if exists notices_feed_idx;
create index if not exists notices_feed_idx on notices (box_id, status, pinned desc, published_at desc);
create index if not exists notices_author_idx on notices (created_by);


-- ---------- quem publica sem aprovação ----------
create or replace function can_publish_notices(p_box uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from people
     where box_id = p_box and auth_user_id = auth.uid()
       and (role = 'owner' or (role = 'coach' and can_publish_notices_directly))
  )
$$;


-- ---------- trigger: autoria, status, campos protegidos e fila do WhatsApp ----------
create or replace function notices_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me people; v_trusted boolean := is_trusted_caller(); v_owner boolean := false; v_direct boolean := false;
  v_on boolean; v_n int; v_box uuid := new.box_id;
  v_was_published boolean := false; v_had_wa boolean := false;  -- estado anterior (só no UPDATE)
begin
  if tg_op = 'UPDATE' then
    v_box := old.box_id;
    v_was_published := old.status = 'published';
    v_had_wa := old.send_whatsapp;
  end if;

  new.title := btrim(new.title);
  new.body  := nullif(btrim(coalesce(new.body, '')), '');
  new.rejection_reason := nullif(btrim(coalesce(new.rejection_reason, '')), '');

  if not v_trusted then
    select * into v_me from people where box_id = v_box and auth_user_id = auth.uid() limit 1;
    v_owner  := v_me.role = 'owner';
    v_direct := v_owner or (v_me.role = 'coach' and v_me.can_publish_notices_directly);
  end if;

  if tg_op = 'INSERT' then
    if not v_trusted then
      new.created_by  := v_me.id;
      new.author_name := v_me.name;
      new.status      := case when v_direct then 'published' else 'pending' end;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.rejection_reason := null;
    elsif new.author_name is null and new.created_by is not null then
      select name into new.author_name from people where id = new.created_by;
    end if;
    new.created_at := now();
    new.published_at := case when new.status = 'published' then now() end;
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

    if v_trusted then
      null; -- SQL Editor / service_role: o que vier
    elsif v_owner then
      -- administrador aprova ou recusa
      if new.status is distinct from old.status and new.status in ('published', 'rejected') then
        new.reviewed_by := v_me.id;
        new.reviewed_at := now();
      else
        new.reviewed_by := old.reviewed_by;
        new.reviewed_at := old.reviewed_at;
      end if;
      if new.status <> 'rejected' then new.rejection_reason := null; end if;
    else
      -- coach: não aprova nem recusa. Editar a própria solicitação reenvia (ou publica, se tiver permissão).
      if old.status = 'published' then
        new.status := 'published';
      else
        new.status := case when v_direct then 'published' else 'pending' end;
      end if;
      if new.status is distinct from old.status then
        new.reviewed_by := null;
        new.reviewed_at := null;
        new.rejection_reason := null;
      else
        new.reviewed_by := old.reviewed_by;
        new.reviewed_at := old.reviewed_at;
        new.rejection_reason := old.rejection_reason;
      end if;
    end if;

    new.published_at := case
      when new.status = 'published' and old.status = 'published' then old.published_at
      when new.status = 'published' then now()
    end;
  end if;
  new.updated_at := now();

  -- alerta urgente: só quando o aviso está publicado, e uma vez por aviso.
  -- Dispara ao publicar (criação direta ou aprovação) ou ao ligar o toggle num aviso já publicado.
  if new.status = 'published' and new.send_whatsapp and new.whatsapp_sent_at is null
     and (not v_was_published or not v_had_wa) then
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
drop policy if exists notices_read   on notices;
drop policy if exists notices_insert on notices;
drop policy if exists notices_update on notices;
drop policy if exists notices_delete on notices;

create policy notices_read on notices for select to authenticated using (
  (status = 'published' and is_member(box_id))
  or is_owner(box_id)
  or (is_staff(box_id) and created_by = caller_person(box_id))
);

create policy notices_insert on notices for insert to authenticated with check (is_staff(box_id));

create policy notices_update on notices for update to authenticated
  using (
    is_owner(box_id)
    or (is_staff(box_id) and created_by = caller_person(box_id) and status <> 'published')
    or (status = 'published' and can_publish_notices(box_id))
  )
  with check (is_staff(box_id));

create policy notices_delete on notices for delete to authenticated using (
  is_owner(box_id)
  or (is_staff(box_id) and created_by = caller_person(box_id) and status <> 'published')
  or (status = 'published' and can_publish_notices(box_id))
);


-- ---------- formulário: disparo, destinatários e se publica direto ----------
drop function if exists notice_dispatch_info(uuid);
create function notice_dispatch_info(p_box uuid)
returns table (dispatch_urgent boolean, recipients int, can_publish_direct boolean, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_staff(p_box);
  return query
  select coalesce(b.dispatch_urgent, false),
         (select count(*)::int from _urgent_recipients(p_box)),
         can_publish_notices(p_box),
         is_owner(p_box)
    from boxes b where b.id = p_box;
end $$;


-- ---------- permissões dos coaches (só administrador) ----------
create or replace function admin_coaches(p_box uuid)
returns table (person_id uuid, name text, is_test boolean, can_publish_notices_directly boolean, pending_notices int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_owner(p_box);
  return query
  select p.id, p.name, coalesce(p.is_test, false), p.can_publish_notices_directly,
         (select count(*)::int from notices n where n.created_by = p.id and n.status = 'pending')
    from people p
   where p.box_id = p_box and p.role = 'coach'
   order by p.name;
end $$;

create or replace function admin_set_coach_publish(p_person uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_box uuid;
begin
  select box_id into v_box from people where id = p_person and role = 'coach';
  if v_box is null then raise exception 'COACH_NAO_ENCONTRADO'; end if;
  perform _assert_owner(v_box);
  update people set can_publish_notices_directly = coalesce(p_enabled, false) where id = p_person;
  return coalesce(p_enabled, false);
end $$;


-- ---------- permissões ----------
revoke execute on function can_publish_notices(uuid) from public, anon;
grant  execute on function can_publish_notices(uuid) to authenticated, service_role;

revoke execute on function notice_dispatch_info(uuid), admin_coaches(uuid), admin_set_coach_publish(uuid, boolean) from public, anon;
grant  execute on function notice_dispatch_info(uuid), admin_coaches(uuid), admin_set_coach_publish(uuid, boolean) to authenticated, service_role;

revoke execute on function notices_before_write() from public, anon, authenticated;
