/*
 * Mural do Box — gestão pela equipe (aba "Avisos" do /clientes/:slug/painel).
 *
 * Administrador (owner):  Pendentes (fila de aprovação) · Mural · Recusados  + Permissões dos coaches
 * Coach:                  Mural · Minhas solicitações
 *
 * Quem publica direto: o administrador e o coach com people.can_publish_notices_directly.
 * Os demais coaches enviam para aprovação. Status, autoria e fila do WhatsApp ficam no
 * banco (trigger de migrations/20261127_avisos_moderacao.sql); esta tela só pede.
 * WhatsApp (custo zero, 20261128_comunidade_whatsapp.sql): aviso publicado tem "Compartilhar na
 * Comunidade" e "Copiar aviso"; o administrador cola o link da Comunidade no topo da tela.
 * `notices` vem de useNotices no componente pai (para o contador de pendentes na aba).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Check,
  ExternalLink,
  Hourglass,
  Loader2,
  Link2,
  Megaphone,
  MessageCircle,
  PartyPopper,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import * as api from '../lib/api/avisos'
import { CATS, Modal, NoticeCard, ShareButtons, SharePreview, Switch, cat } from '../avisos/shared'

const EMPTY = { title: '', body: '', category: 'geral', pinned: false }
const TITLE_MAX = 120
const BODY_MAX = 2000
const REASON_MAX = 500
const FORM_CATS = Object.entries(CATS).filter(([, c]) => c.form)
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`

export default function AvisosGestao({ box, me, role, notify, notices }) {
  const isAdmin = role === 'owner'
  const { rows, status, error, reload, upsertLocal, removeLocal } = notices
  const { slug } = useParams()
  const [info, setInfo] = useState(null) // { can_publish_direct, is_admin, whatsapp_community_url }
  const canPublish = isAdmin || Boolean(info?.can_publish_direct)

  const loadInfo = useCallback(() => {
    api.fetchNoticeSettings(box.id).then(setInfo, () => setInfo((i) => i || { can_publish_direct: false, whatsapp_community_url: null }))
  }, [box.id])
  useEffect(loadInfo, [loadInfo])

  const groups = useMemo(
    () => ({
      published: rows.filter((n) => n.status === 'published'),
      pending: rows.filter((n) => n.status === 'pending'),
      rejected: rows.filter((n) => n.status === 'rejected'),
      mine: rows.filter((n) => n.created_by === me?.id),
    }),
    [rows, me?.id],
  )

  const TABS = isAdmin
    ? [
        ['pending', 'Pendentes', groups.pending.length],
        ['published', 'Mural', null],
        ['rejected', 'Recusados', null],
      ]
    : [
        ['published', 'Mural', null],
        ['mine', 'Minhas solicitações', groups.mine.filter((n) => n.status !== 'published').length],
      ]
  const [tab, setTab] = useState(isAdmin ? 'pending' : 'published')
  // admin sem nada pendente cai no mural na primeira carga
  const [autoTab, setAutoTab] = useState(true)
  useEffect(() => {
    if (!autoTab || status !== 'ready') return
    if (isAdmin && groups.pending.length === 0) setTab('published')
    setAutoTab(false)
  }, [autoTab, status, isAdmin, groups.pending.length])

  const [editing, setEditing] = useState(null) // { mode: 'create' | 'edit' | 'review', notice? }
  const [confirmDel, setConfirmDel] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [showPerms, setShowPerms] = useState(false)
  const [sharing, setSharing] = useState(null) // aviso recém-publicado/aprovado → modal de compartilhar
  const [busy, setBusy] = useState(null)

  const act = async (id, fn) => {
    setBusy(id)
    const res = await fn()
    setBusy(null)
    notify(res.message, res.ok ? 'ok' : 'err')
    return res
  }
  const togglePin = async (n) => {
    const res = await act(n.id, () => api.setPinned(n.id, !n.pinned))
    if (res.ok) upsertLocal(res.data)
  }
  const approve = async (n) => {
    const res = await act(n.id, () => api.approveNotice(n.id))
    if (res.ok) {
      upsertLocal(res.data)
      setSharing(res.data)
    }
  }
  const remove = async () => {
    const n = confirmDel
    const res = await act(n.id, () => api.deleteNotice(n.id, { request: n.status !== 'published' }))
    setConfirmDel(null)
    if (res.ok) removeLocal(n.id)
  }
  const reject = async (reason) => {
    const n = rejecting
    const res = await act(n.id, () => api.rejectNotice(n.id, reason))
    if (res.ok) {
      upsertLocal(res.data)
      setRejecting(null)
    }
  }

  // o que cada um pode fazer em cada aviso (o RLS confere de novo no banco)
  const canManage = (n) => isAdmin || (n.status === 'published' ? canPublish : n.created_by === me?.id)

  const list = tab === 'mine' ? groups.mine : groups[tab] || []

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold uppercase leading-tight">Mural do box</h2>
          <p className="text-xs text-fg-muted">
            {isAdmin
              ? 'Aprove os avisos dos coaches e publique os seus.'
              : canPublish
                ? 'Você publica direto: os alunos veem na hora.'
                : 'Seus avisos passam pela aprovação do administrador.'}
          </p>
        </div>
        <button onClick={reload} aria-label="Atualizar" title="Atualizar" className="rounded-xl p-2.5 text-fg-muted ring-1 ring-line hover:bg-card hover:text-fg">
          <RefreshCw size={15} />
        </button>
        <button
          onClick={() => {
            loadInfo()
            setEditing({ mode: 'create' })
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-bold text-on-accent transition hover:bg-accent-strong active:scale-[.98]"
        >
          <Plus size={16} /> Novo aviso
        </button>
      </div>

      {isAdmin && info && <CommunityLink box={box} url={info.whatsapp_community_url} notify={notify} onSaved={(u) => setInfo((i) => ({ ...i, whatsapp_community_url: u }))} />}

      <div className="mb-3 flex items-center gap-2">
        <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-card p-1 ring-1 ring-line">
          {TABS.map(([k, l, n]) => {
            const alert = k === 'pending' && n > 0
            return (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`flex shrink-0 grow items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase ${
                  tab === k ? 'bg-inverse text-on-inverse' : alert ? 'text-amber-700 dark:text-amber-300' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {k === 'pending' && <Hourglass size={13} />}
                {l}
                {n > 0 && (
                  <span className={`rounded-full px-1.5 text-[10px] ${alert ? 'bg-amber-500 text-white' : tab === k ? 'bg-on-inverse/20' : 'bg-elevated'}`}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowPerms(true)}
            title="Permissões dos coaches"
            aria-label="Permissões dos coaches"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-fg-soft ring-1 ring-line hover:bg-card hover:text-fg"
          >
            <ShieldCheck size={15} /> <span className="hidden sm:inline">Permissões</span>
          </button>
        )}
      </div>

      {status === 'loading' && (
        <div className="flex justify-center py-16 text-fg-muted">
          <Loader2 className="animate-spin" size={24} aria-label="Carregando" />
        </div>
      )}
      {status === 'error' && (
        <EmptyBox icon={RefreshCw}>
          {error}
          <button onClick={reload} className="font-semibold text-fg underline underline-offset-4">
            Tentar de novo
          </button>
        </EmptyBox>
      )}
      {status === 'ready' && list.length === 0 && <EmptyTab tab={tab} canPublish={canPublish} onNew={() => setEditing({ mode: 'create' })} />}

      {status === 'ready' && list.length > 0 && (
        <ul className="space-y-3">
          {list.map((n) => (
            <li key={n.id}>
              <NoticeCard
                n={n}
                showStatus={tab === 'mine' || tab === 'rejected'}
                footer={
                  <>
                    {n.status === 'rejected' && (
                      <div className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-500/20 dark:text-rose-200">
                        <b>Recusado{n.rejection_reason ? ':' : ''}</b> {n.rejection_reason || 'sem motivo informado.'}
                        {!isAdmin && ' Edite e reenvie, se quiser.'}
                      </div>
                    )}
                    {n.status === 'pending' && !isAdmin && (
                      <p className="mt-2 text-[11px] text-fg-subtle">Os alunos ainda não veem este aviso.</p>
                    )}
                    {n.status === 'published' && (
                      <div className="mt-3 border-t border-line pt-3">
                        <ShareButtons n={n} box={box} slug={slug} notify={notify} />
                      </div>
                    )}
                    <Actions
                      n={n}
                      isAdmin={isAdmin}
                      canManage={canManage(n)}
                      busy={busy === n.id}
                      onApprove={() => approve(n)}
                      onReview={() => {
                        loadInfo()
                        setEditing({ mode: 'review', notice: n })
                      }}
                      onReject={() => setRejecting(n)}
                      onPin={() => togglePin(n)}
                      onEdit={() => {
                        loadInfo()
                        setEditing({ mode: 'edit', notice: n })
                      }}
                      onDelete={() => setConfirmDel(n)}
                    />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <NoticeForm
          box={box}
          mode={editing.mode}
          notice={editing.notice}
          info={info}
          canPublish={canPublish}
          isAdmin={isAdmin}
          notify={notify}
          onClose={() => setEditing(null)}
          onSaved={(n, message) => {
            upsertLocal(n)
            notify(message, 'ok')
            setEditing(null)
            if (n.status === 'published' && editing.notice?.status !== 'published') setSharing(n)
            if (!isAdmin && n.status !== 'published') setTab('mine')
            if (isAdmin && n.status === 'published' && tab !== 'published' && editing.mode === 'create') setTab('published')
          }}
        />
      )}

      <Modal
        open={Boolean(confirmDel)}
        onClose={() => busy == null && setConfirmDel(null)}
        title={confirmDel?.status === 'published' ? 'Excluir aviso?' : 'Excluir solicitação?'}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmDel(null)} disabled={busy != null} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-fg-soft ring-1 ring-line hover:bg-card">
              Cancelar
            </button>
            <button
              onClick={remove}
              disabled={busy != null}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {busy != null ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Excluir
            </button>
          </div>
        }
      >
        <p className="text-sm text-fg-muted">
          “<b className="text-fg">{confirmDel?.title}</b>”{' '}
          {confirmDel?.status === 'published' ? 'sai do mural de todos os alunos.' : 'será apagada.'} Não dá para desfazer.
          {confirmDel?.whatsapp_sent_at && ' As mensagens de WhatsApp já enviadas continuam no celular dos alunos.'}
        </p>
      </Modal>

      {rejecting && <RejectModal notice={rejecting} busy={busy === rejecting.id} onClose={() => busy == null && setRejecting(null)} onConfirm={reject} />}
      {sharing && <ShareModal n={sharing} box={box} slug={slug} notify={notify} onClose={() => setSharing(null)} />}
      {showPerms && <PermissionsModal box={box} notify={notify} onClose={() => setShowPerms(false)} />}
    </section>
  )
}

/* ---------- peças da lista ---------- */

function EmptyBox({ icon: Icon = Megaphone, children }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center text-sm text-fg-muted ring-1 ring-line">
      <Icon size={24} className="text-fg-subtle" />
      {children}
    </div>
  )
}

function EmptyTab({ tab, canPublish, onNew }) {
  if (tab === 'pending') return <EmptyBox icon={Check}>Nenhuma solicitação esperando sua aprovação. 🎉</EmptyBox>
  if (tab === 'rejected') return <EmptyBox icon={X}>Nenhuma solicitação recusada.</EmptyBox>
  if (tab === 'mine')
    return (
      <EmptyBox icon={Send}>
        Você ainda não enviou avisos.
        <button onClick={onNew} className="font-semibold text-fg underline underline-offset-4">
          {canPublish ? 'Publicar um aviso' : 'Enviar um aviso para aprovação'}
        </button>
      </EmptyBox>
    )
  return (
    <EmptyBox>
      <b className="text-fg">Nenhum aviso publicado.</b>
      Avise sobre feriados, mudanças de horário, eventos e aulões.
      <button onClick={onNew} className="mt-1 font-semibold text-fg underline underline-offset-4">
        {canPublish ? 'Publicar o primeiro aviso' : 'Enviar o primeiro aviso'}
      </button>
    </EmptyBox>
  )
}

function QuickBtn({ children, primary, ...p }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 disabled:opacity-40 ${
        primary ? 'bg-accent text-on-accent ring-accent hover:bg-accent-strong' : 'bg-card text-fg ring-line hover:bg-elevated'
      }`}
    >
      {children}
    </button>
  )
}

function Actions({ n, isAdmin, canManage, busy, onApprove, onReview, onReject, onPin, onEdit, onDelete }) {
  const spin = <Loader2 size={13} className="animate-spin" />
  const del = canManage && (
    <button
      onClick={onDelete}
      disabled={busy}
      aria-label={`Excluir ${n.title}`}
      title="Excluir"
      className="ml-auto rounded-lg p-2 text-fg-muted hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40 dark:hover:text-rose-300"
    >
      <Trash2 size={15} />
    </button>
  )

  // fila de aprovação / recusados (admin)
  if (isAdmin && n.status !== 'published') {
    return (
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
        <QuickBtn primary onClick={onApprove} disabled={busy}>
          {busy ? spin : <Check size={13} />} Aprovar e publicar
        </QuickBtn>
        <QuickBtn onClick={onReview} disabled={busy}>
          <Pencil size={13} /> Editar antes
        </QuickBtn>
        {n.status === 'pending' && (
          <QuickBtn onClick={onReject} disabled={busy}>
            <X size={13} /> Recusar
          </QuickBtn>
        )}
        {del}
      </div>
    )
  }

  if (!canManage) return null

  // solicitação do próprio coach
  if (n.status !== 'published') {
    return (
      <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
        <QuickBtn onClick={onEdit} disabled={busy}>
          <Pencil size={13} /> {n.status === 'rejected' ? 'Editar e reenviar' : 'Editar'}
        </QuickBtn>
        {del}
      </div>
    )
  }

  return (
    <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
      <QuickBtn onClick={onPin} disabled={busy}>
        {busy ? spin : n.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        {n.pinned ? 'Desafixar' : 'Fixar'}
      </QuickBtn>
      <QuickBtn onClick={onEdit} disabled={busy}>
        <Pencil size={13} /> Editar
      </QuickBtn>
      {del}
    </div>
  )
}

/* ---------- Comunidade do WhatsApp: link (admin) e compartilhar depois de publicar ---------- */

function CommunityLink({ box, url, notify, onSaved }) {
  const [editing, setEditing] = useState(!url)
  const [value, setValue] = useState(url || '')
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e?.preventDefault()
    setSaving(true)
    const res = await api.setCommunityUrl(box.id, value.trim())
    setSaving(false)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (!res.ok) return
    onSaved(res.data)
    setValue(res.data || '')
    setEditing(!res.data)
  }

  if (!editing && url) {
    return (
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-wa-light">
          <MessageCircle size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-fg-muted">Comunidade do WhatsApp</div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-sm font-semibold text-fg hover:underline">
            <span className="truncate">{url.replace('https://', '')}</span> <ExternalLink size={12} className="shrink-0" />
          </a>
        </div>
        <button onClick={() => setEditing(true)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-fg-soft ring-1 ring-line hover:bg-elevated">
          Alterar
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="mb-3 rounded-2xl bg-card p-4 ring-1 ring-line">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-muted">
        <MessageCircle size={14} className="text-emerald-700 dark:text-wa-light" /> Comunidade do WhatsApp
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        Cole o link de convite da Comunidade do box. Os alunos veem um convite no mural, e você compartilha cada aviso lá sem custo de mensagem.
      </p>
      <div className="mt-3 flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            className={`${inputCls} pl-9`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
            inputMode="url"
            aria-label="Link de convite da Comunidade do WhatsApp"
          />
        </label>
        <button
          type="submit"
          disabled={saving || (!value.trim() && !url)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent-strong disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {value.trim() || !url ? 'Salvar' : 'Remover'}
        </button>
      </div>
      {url && (
        <button
          type="button"
          onClick={() => {
            setValue(url)
            setEditing(false)
          }}
          className="mt-2 text-xs font-semibold text-fg-soft underline underline-offset-4 hover:text-fg"
        >
          Cancelar
        </button>
      )}
    </form>
  )
}

function ShareModal({ n, box, slug, notify, onClose }) {
  return (
    <Modal open onClose={onClose} title="Aviso publicado" footer={<ShareButtons n={n} box={box} slug={slug} notify={notify} size="lg" />}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PartyPopper size={18} className="text-highlight" /> Já está no mural dos alunos.
      </div>
      <p className="mt-1 text-sm text-fg-muted">Avise também na Comunidade do WhatsApp do box, sem custo. O texto vai pronto:</p>
      <div className="mt-3">
        <SharePreview n={n} box={box} slug={slug} />
      </div>
      <button onClick={onClose} className="mt-3 w-full rounded-xl py-2 text-xs font-semibold text-fg-soft hover:bg-card">
        Agora não
      </button>
    </Modal>
  )
}

/* ---------- recusar ---------- */

function RejectModal({ notice, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open
      onClose={onClose}
      title="Recusar solicitação"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-fg-soft ring-1 ring-line hover:bg-card">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Recusar
          </button>
        </div>
      }
    >
      <p className="text-sm text-fg-muted">
        “<b className="text-fg">{notice.title}</b>”{notice.author_name ? `, de ${notice.author_name},` : ''} não vai para o mural. O coach vê a recusa e o motivo em “Minhas
        solicitações”.
      </p>
      <label className="mt-4 block">
        <span className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Motivo <span className="font-normal normal-case text-fg-subtle">opcional · {reason.length}/{REASON_MAX}</span>
        </span>
        <textarea
          className={inputCls}
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: o horário do feriado ainda não foi confirmado"
          autoFocus
        />
      </label>
    </Modal>
  )
}

/* ---------- permissões dos coaches ---------- */

function PermissionsModal({ box, notify, onClose }) {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    let alive = true
    api.fetchCoaches(box.id).then(
      (rows) => alive && setState({ status: 'ok', rows }),
      (e) => alive && setState({ status: 'error', rows: [], message: e.message }),
    )
    return () => {
      alive = false
    }
  }, [box.id])

  const toggle = async (c, on) => {
    setSaving(c.person_id)
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.person_id === c.person_id ? { ...r, can_publish_notices_directly: on } : r)) }))
    const res = await api.setCoachPublish(c.person_id, on, c.name)
    setSaving(null)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (!res.ok) setState((s) => ({ ...s, rows: s.rows.map((r) => (r.person_id === c.person_id ? { ...r, can_publish_notices_directly: !on } : r)) }))
  }

  return (
    <Modal open onClose={onClose} title="Permissões dos coaches">
      <p className="text-sm text-fg-muted">
        Coach com a opção ligada publica avisos direto no mural, sem passar pela sua aprovação. Por padrão fica desligado. Avisos já enviados continuam na fila.
      </p>
      {state.status === 'loading' && (
        <div className="flex justify-center py-10 text-fg-muted">
          <Loader2 className="animate-spin" size={22} aria-label="Carregando" />
        </div>
      )}
      {state.status === 'error' && <p className="mt-4 text-sm text-rose-700 dark:text-rose-300">{state.message}</p>}
      {state.status === 'ok' && state.rows.length === 0 && (
        <p className="mt-4 rounded-xl bg-card px-4 py-6 text-center text-sm text-fg-muted ring-1 ring-line">Nenhum coach cadastrado neste box.</p>
      )}
      {state.status === 'ok' && state.rows.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-2xl bg-card ring-1 ring-line">
          {state.rows.map((c) => (
            <li key={c.person_id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated font-display text-sm font-bold">{c.name[0]}</span>
              <div className="min-w-0 flex-1">
                <Switch
                  checked={c.can_publish_notices_directly}
                  onChange={(on) => toggle(c, on)}
                  disabled={saving === c.person_id}
                  label={
                    <span className="truncate">
                      {c.name}
                      {c.is_test && <span className="ml-1.5 rounded bg-elevated px-1 text-[10px] font-bold uppercase text-fg-subtle">teste</span>}
                    </span>
                  }
                  description={
                    (c.can_publish_notices_directly ? 'Publica avisos sem aprovação' : 'Avisos passam pela sua aprovação') +
                    (c.pending_notices ? ` · ${plural(c.pending_notices, 'pendente')}` : '')
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/* ---------- formulário: criar / editar / editar antes de aprovar ---------- */

const inputCls =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

function NoticeForm({ box, mode, notice, info, canPublish, isAdmin, onClose, onSaved, notify }) {
  const [f, setF] = useState(() => (notice ? { ...EMPTY, ...notice, body: notice.body || '' } : EMPTY))
  const [saving, setSaving] = useState(false)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  // como o aviso sai depois de salvar
  const willPublish = mode === 'review' || notice?.status === 'published' || canPublish
  const needsApproval = !willPublish

  const pickCategory = (k) => setF((x) => ({ ...x, category: k }))

  const close = useCallback(() => !saving && onClose(), [saving, onClose])

  const save = async (e) => {
    e?.preventDefault()
    if (!f.title.trim()) return notify('Informe o título do aviso.', 'err')
    setSaving(true)
    const res =
      mode === 'review' ? await api.approveNotice(notice.id, f) : mode === 'edit' ? await api.updateNotice(notice, f) : await api.createNotice(box.id, f)
    setSaving(false)
    if (!res.ok) return notify(res.message, 'err')
    onSaved(res.data, res.message)
  }

  const title = { create: 'Novo aviso', edit: notice?.status === 'rejected' ? 'Editar e reenviar' : 'Editar aviso', review: 'Revisar e aprovar' }[mode]
  let submit = 'Publicar'
  if (mode === 'review') submit = 'Aprovar e publicar'
  else if (mode === 'edit' && notice?.status === 'published') submit = 'Salvar alterações'
  else if (needsApproval) submit = notice?.status === 'rejected' ? 'Reenviar para aprovação' : mode === 'edit' ? 'Salvar solicitação' : 'Enviar para aprovação'
  else if (mode === 'edit') submit = 'Salvar e publicar'

  return (
    <Modal
      open
      onClose={close}
      title={title}
      footer={
        <>
          {needsApproval && (
            <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-fg-muted">
              <Hourglass size={12} /> Este aviso será enviado ao administrador antes de aparecer para os alunos.
            </p>
          )}
          <button
            type="submit"
            form="notice-form"
            disabled={saving || (mode === 'create' && !isAdmin && info == null)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-on-accent transition hover:bg-accent-strong active:scale-[.98] disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : needsApproval ? <Hourglass size={16} /> : mode === 'review' ? <Check size={16} /> : <Send size={16} />}
            {submit}
          </button>
        </>
      }
    >
      <form id="notice-form" onSubmit={save} className="space-y-4">
        {mode === 'review' && notice?.author_name && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-200">
            Solicitação de <b>{notice.author_name}</b>. Ajuste o que precisar: ao salvar, o aviso é aprovado e publicado.
          </p>
        )}
        {mode === 'edit' && notice?.status === 'rejected' && notice.rejection_reason && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-500/20 dark:text-rose-200">
            <b>Motivo da recusa:</b> {notice.rejection_reason}
          </p>
        )}

        <label className="block">
          <span className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Título <span className="font-normal normal-case text-fg-subtle">{f.title.length}/{TITLE_MAX}</span>
          </span>
          <input
            className={inputCls}
            value={f.title}
            maxLength={TITLE_MAX}
            onChange={(e) => set('title')(e.target.value)}
            placeholder="Ex.: Feriado 20/11: só aulas das 07:00 e 08:00"
            autoFocus={mode === 'create'}
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Mensagem <span className="font-normal normal-case text-fg-subtle">{f.body.length}/{BODY_MAX}</span>
          </span>
          <textarea className={inputCls} rows={4} maxLength={BODY_MAX} value={f.body} onChange={(e) => set('body')(e.target.value)} placeholder="Detalhes para os alunos" />
        </label>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">Categoria</legend>
          <div className="grid grid-cols-2 gap-2">
            {FORM_CATS.map(([k, c]) => {
              const Icon = c.icon
              const active = f.category === k
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickCategory(k)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition ${
                    active ? `${c.badge} ring-2 ${k === 'geral' ? 'ring-line-strong' : c.ring}` : 'bg-card text-fg-muted ring-line hover:text-fg'
                  }`}
                >
                  <Icon size={15} /> {c.label}
                </button>
              )
            })}
            {!CATS[f.category]?.form && (
              <span className="col-span-2 text-[11px] text-fg-subtle">Categoria antiga: {cat(f.category).label}. Escolha uma das acima para trocar.</span>
            )}
          </div>
        </fieldset>

        <div className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-line">
          <Switch checked={f.pinned} onChange={set('pinned')} icon={Pin} label="Fixar no topo" description="Fica acima dos outros avisos até ser desafixado." />

          <p className="flex items-start gap-1.5 border-t border-line pt-3 text-[11px] text-fg-muted">
            <MessageCircle size={13} className="mt-px shrink-0 text-emerald-700 dark:text-wa-light" />
            {needsApproval
              ? 'Depois de aprovado, o aviso pode ser compartilhado na Comunidade do WhatsApp do box, sem custo.'
              : 'Ao publicar, você pode compartilhar o aviso na Comunidade do WhatsApp do box, sem custo.'}
          </p>
        </div>
      </form>
    </Modal>
  )
}
