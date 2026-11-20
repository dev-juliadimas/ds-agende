/*
 * Peças do Mural do Box usadas pelo aluno (agenda/MuralAvisos.jsx) e pela equipe
 * (painel/AvisosGestao.jsx): categorias, hook com Realtime, card, modal e toggle.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock, Copy, Hourglass, Megaphone, MessageCircle, Pin, Siren, X, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { feedDate, fetchNotices, noticeShareText, sortNotices } from '../lib/api/avisos'
import { toFriendlyError } from '../lib/api/errors'

const BOX_TZ = 'America/Sao_Paulo'

/* ---------- categorias ---------- */

// `form: true` = aparece no formulário do coach. As demais vêm de avisos antigos.
export const CATS = {
  geral: { label: 'Geral', icon: Megaphone, badge: 'bg-elevated text-fg-soft', ring: 'ring-line', form: true },
  urgente: {
    label: 'Urgente',
    icon: Siren,
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-500/40',
    bar: 'bg-rose-500',
    form: true,
  },
  evento: { label: 'Evento', icon: CalendarDays, badge: 'bg-accent/15 text-highlight', ring: 'ring-line', bar: 'bg-accent', form: true },
  horario: {
    label: 'Horário',
    icon: Clock,
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/35',
    bar: 'bg-amber-500',
    form: true,
  },
  feriado: { label: 'Feriado', icon: Clock, badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', ring: 'ring-line', bar: 'bg-amber-500' },
  aulao: { label: 'Aulão', icon: CalendarDays, badge: 'bg-accent/15 text-highlight', ring: 'ring-line', bar: 'bg-accent' },
  desafio: { label: 'Desafio', icon: CalendarDays, badge: 'bg-accent/15 text-highlight', ring: 'ring-line', bar: 'bg-accent' },
}
export const cat = (k) => CATS[k] || CATS.geral

// Filtro rápido do aluno. "Horários" inclui feriados antigos; "Eventos" inclui aulão e desafio.
export const FILTERS = [
  ['todos', 'Todos', () => true],
  ['urgente', 'Urgentes', (n) => n.category === 'urgente'],
  ['evento', 'Eventos', (n) => ['evento', 'aulao', 'desafio'].includes(n.category)],
  ['horario', 'Horários', (n) => ['horario', 'feriado'].includes(n.category)],
]

/* ---------- datas ---------- */

export function timeAgo(ts, now = Date.now()) {
  const min = Math.round((now - new Date(ts)) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d < 7) return `há ${d} dia${d > 1 ? 's' : ''}`
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BOX_TZ, day: '2-digit', month: 'short' }).format(new Date(ts))
}

/* ---------- dados + Realtime ---------- */

/**
 * Avisos do box, já ordenados (fixados → mais novos), atualizados por Realtime:
 *   INSERT/UPDATE do box → entram/atualizam na hora. O RLS decide o que chega: o aluno só
 *     recebe avisos publicados, então a aprovação pelo admin chega a ele como UPDATE de uma
 *     linha que ele ainda não tinha — tratamos como aviso novo.
 *   DELETE → chega só o id (Realtime não filtra DELETE por coluna); some da lista se estiver nela
 * `publishedOnly`: mural do aluno (coach logado na agenda não vê as próprias pendentes ali).
 * `onNew(notice)`: aviso que apareceu pelo Realtime (não na carga inicial).
 */
export function useNotices(boxId, { onNew, publishedOnly = false } = {}) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [live, setLive] = useState('off')
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew
  const known = useRef(new Set()) // ids que já estão na tela (para saber o que é novo)

  const apply = useCallback((list) => {
    known.current = new Set(list.map((n) => n.id))
    return sortNotices(list)
  }, [])

  const reload = useCallback(async () => {
    if (!boxId) return
    try {
      const data = await fetchNotices(boxId, { publishedOnly })
      setRows(apply(data))
      setStatus('ready')
      setError(null)
    } catch (e) {
      setError(toFriendlyError(e).message)
      setStatus((s) => (s === 'ready' ? s : 'error'))
    }
  }, [boxId, publishedOnly, apply])

  useEffect(() => {
    setStatus('loading')
    reload()
  }, [reload])

  // mudança feita nesta tela: aplica já, sem esperar o Realtime
  const upsertLocal = useCallback(
    (n) => {
      if (publishedOnly && n.status !== 'published') return setRows((prev) => apply(prev.filter((x) => x.id !== n.id)))
      setRows((prev) => apply([n, ...prev.filter((x) => x.id !== n.id)]))
    },
    [publishedOnly, apply],
  )
  const removeLocal = useCallback((id) => setRows((prev) => apply(prev.filter((x) => x.id !== id))), [apply])

  useEffect(() => {
    if (!supabase || !boxId) return
    setLive('connecting')
    const filter = `box_id=eq.${boxId}`
    const onRow = ({ new: n }) => {
      const visible = !publishedOnly || n.status === 'published'
      const isNew = visible && !known.current.has(n.id)
      upsertLocal(n)
      if (isNew) onNewRef.current?.(n)
    }
    const channel = supabase
      .channel(`notices:${boxId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notices', filter }, onRow)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notices', filter }, onRow)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notices' }, ({ old }) => old?.id && removeLocal(old.id))
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          setLive('live')
          reload() // o que mudou enquanto conectava
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setLive('error')
        else if (st === 'CLOSED') setLive('off')
      })

    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [boxId, publishedOnly, reload, upsertLocal, removeLocal])

  return { rows, status, error, live, reload, upsertLocal, removeLocal }
}

/* ---------- status da moderação ---------- */

export const STATUS = {
  pending: { label: 'Aguardando aprovação', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: Hourglass },
  published: { label: 'Publicado', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  rejected: { label: 'Recusado', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', icon: XCircle },
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>
      <Icon size={11} /> {s.label}
    </span>
  )
}

/* ---------- card ---------- */

export function CategoryBadge({ category }) {
  const c = cat(category)
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.badge}`}>
      <Icon size={11} /> {c.label}
    </span>
  )
}

export function NoticeCard({ n, fresh, footer, now, showStatus }) {
  const c = cat(n.category)
  const ring = n.category === 'urgente' || n.category === 'horario' ? c.ring : n.pinned ? 'ring-accent/45' : 'ring-line'
  return (
    <article className={`relative overflow-hidden rounded-2xl bg-card ring-1 ${ring} ${fresh ? 'animate-slideup' : ''}`}>
      {c.bar && <div className={`absolute inset-y-0 left-0 w-1 ${c.bar}`} aria-hidden />}
      <div className="p-4 pl-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {showStatus && <StatusBadge status={n.status} />}
          {n.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-accent">
              <Pin size={10} className="fill-current" /> Fixado
            </span>
          )}
          <CategoryBadge category={n.category} />
          {fresh && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Novo</span>}
          <span className="ml-auto text-[11px] text-fg-subtle">{timeAgo(feedDate(n), now)}</span>
        </div>
        <h3 className="mt-2 font-display text-lg font-bold leading-tight">{n.title}</h3>
        {n.body && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-fg-muted">{n.body}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
          {n.author_name && <span>{n.author_name}</span>}
          {n.whatsapp_sent_at && (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-wa-light">
              <MessageCircle size={11} /> Enviado no WhatsApp
            </span>
          )}
        </div>
        {footer}
      </div>
    </article>
  )
}

/* ---------- modal (bottom sheet no celular, centralizado no desktop) ---------- */

export function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-slideup flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface sm:rounded-3xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide">{title}</h2>
          <button onClick={onClose} className="rounded-full bg-card p-1.5 text-fg-muted ring-1 ring-line hover:text-fg" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- toggle ---------- */

export function Switch({ checked, onChange, label, description, icon: Icon, tone = 'accent', disabled }) {
  const on = tone === 'wa' ? 'bg-emerald-600' : 'bg-accent'
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {Icon && <Icon size={15} className={tone === 'wa' ? 'text-emerald-700 dark:text-wa-light' : 'text-highlight'} />}
          {label}
        </span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50 ${checked ? on : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </label>
  )
}

/* ---------- compartilhar na Comunidade do WhatsApp (custo zero) ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // navegador sem permissão de clipboard (ex.: http, iframe): cópia pelo jeito antigo
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * "Compartilhar na Comunidade" + "Copiar aviso".
 * No celular usa a folha de compartilhar do sistema (o WhatsApp aparece nela);
 * no computador abre o WhatsApp Web com o texto pronto — falta só escolher a Comunidade.
 */
export function ShareButtons({ n, box, slug, notify, size = 'sm' }) {
  const text = noticeShareText(n, { boxName: box?.name, slug })
  const share = async () => {
    if (isTouch() && navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (e) {
        if (e?.name === 'AbortError') return // fechou a folha de compartilhar
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }
  const copy = async () => notify(...((await copyText(text)) ? ['Aviso copiado. Cole na Comunidade do WhatsApp. 📋', 'ok'] : ['Não foi possível copiar. Selecione o texto e copie.', 'err']))
  const big = size === 'lg'
  return (
    <div className={`flex gap-1.5 ${big ? 'flex-col sm:flex-row' : 'flex-wrap'}`}>
      <button
        type="button"
        onClick={share}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition hover:brightness-95 active:scale-[.98] ${big ? 'flex-1 rounded-xl py-3 text-sm' : 'px-3 py-1.5 text-xs'}`}
        style={{ background: '#128c4b' }}
      >
        <MessageCircle size={big ? 16 : 13} /> Compartilhar na Comunidade
      </button>
      <button
        type="button"
        onClick={copy}
        className={`inline-flex items-center justify-center gap-1.5 bg-card font-semibold text-fg ring-1 ring-line transition hover:bg-elevated ${big ? 'flex-1 rounded-xl py-3 text-sm' : 'rounded-lg px-3 py-1.5 text-xs'}`}
      >
        <Copy size={big ? 16 : 13} /> Copiar aviso
      </button>
    </div>
  )
}

/** Pré-visualização do texto que vai para o WhatsApp (com *negrito*). */
export function SharePreview({ n, box, slug }) {
  const text = noticeShareText(n, { boxName: box?.name, slug })
  const html = text
    .split('\n')
    .map((line, i) => (
      <span key={i} className="block min-h-[1em] break-words">
        {line.split(/(\*[^*]+\*)/).map((part, j) => (part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <b key={j}>{part.slice(1, -1)}</b> : part))}
      </span>
    ))
  return <div className="rounded-xl rounded-tl-sm bg-emerald-500/10 px-3 py-2.5 text-[13px] leading-snug text-fg ring-1 ring-emerald-500/25">{html}</div>
}
