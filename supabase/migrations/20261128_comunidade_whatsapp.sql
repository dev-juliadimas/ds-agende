-- =====================================================================
-- Mural do Box: avisos vão para a Comunidade do WhatsApp do box (custo zero)
--
-- Depende de: 20261127_avisos_moderacao.sql (trigger notices_before_write, can_publish_notices),
--             20261123_painel_admin.sql (is_owner, _assert_owner),
--             20261124_painel_coach.sql (_assert_staff).
--
-- Antes: aviso com send_whatsapp = true enfileirava 1 mensagem paga (Meta) por aluno.
-- Agora: o aviso não entra mais na whatsapp_outbox. Quem publica compartilha o texto
--        pronto na Comunidade do WhatsApp do box (botão no painel). A fila paga fica só
--        para mensagens individuais: lembrete anti-falta, lista de espera e cobrança.
--
--   • boxes.whatsapp_community_url: link de convite da Comunidade (só o administrador muda)
--   • notices.send_whatsapp / whatsapp_sent_at / whatsapp_recipients ficam como histórico
--     dos avisos antigos; nada novo é gravado nelas.
--   • notice_dispatch_info → notice_settings (sem custo/destinatários; com o link)
--   • box_community_url: o aluno lê o link (só membro do box) para o convite no mural
--
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table boxes add column if not exists whatsapp_community_url text;
alter table boxes drop constraint if exists boxes_whatsapp_community_url_check;
alter table boxes add constraint boxes_whatsapp_community_url_check
  check (whatsapp_community_url is null or whatsapp_community_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$');


-- ---------- trigger sem a fila do WhatsApp ----------
create or replace function notices_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me people; v_trusted boolean := is_trusted_caller(); v_owner boolean := false; v_direct boolean := false;
  v_box uuid := new.box_id;
begin
  if tg_op = 'UPDATE' then v_box := old.box_id; end if;

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
    new.send_whatsapp := false;          -- disparo pago desativado (Comunidade do WhatsApp)
    new.whatsapp_sent_at := null;
    new.whatsapp_recipients := null;
  else
    -- quem publicou, o box e o histórico de envio não mudam pela edição
    new.box_id := old.box_id;
    new.created_by := old.created_by;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    new.send_whatsapp := old.send_whatsapp;
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
  return new;
end $$;

drop trigger if exists notices_before_write on notices;
create trigger notices_before_write before insert or update on notices
  for each row execute function notices_before_write();

-- não é mais usada pelo mural (a fila paga ficou só para mensagens individuais)
drop function if exists _urgent_recipients(uuid);


-- ---------- formulário do painel ----------
drop function if exists notice_dispatch_info(uuid);
drop function if exists notice_settings(uuid);
create function notice_settings(p_box uuid)
returns table (can_publish_direct boolean, is_admin boolean, whatsapp_community_url text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_staff(p_box);
  return query
  select can_publish_notices(p_box), is_owner(p_box), b.whatsapp_community_url
    from boxes b where b.id = p_box;
end $$;

-- administrador cola/edita o link (null ou '' apaga)
create or replace function admin_set_community_url(p_box uuid, p_url text)
returns text language plpgsql security definer set search_path = public as $$
declare v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  perform _assert_owner(p_box);
  if v_url is not null then
    v_url := regexp_replace(v_url, '[?#].*$', '');   -- tira ?utm=... do link copiado
    if v_url !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$' then raise exception 'LINK_COMUNIDADE_INVALIDO'; end if;
  end if;
  update boxes set whatsapp_community_url = v_url where id = p_box;
  return v_url;
end $$;

-- aluno (membro do box) lê o link para o convite no mural
create or replace function box_community_url(p_box uuid)
returns text language sql stable security definer set search_path = public as $$
  select b.whatsapp_community_url from boxes b where b.id = p_box and is_member(p_box)
$$;


-- ---------- permissões ----------
revoke execute on function notice_settings(uuid), admin_set_community_url(uuid, text), box_community_url(uuid) from public, anon;
grant  execute on function notice_settings(uuid), admin_set_community_url(uuid, text), box_community_url(uuid) to authenticated, service_role;
revoke execute on function notices_before_write() from public, anon, authenticated;
