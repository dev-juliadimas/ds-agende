/*
 * Mural do Box — visão do aluno (aba "Avisos" da /clientes/:slug/agenda).
 * Dados e Realtime: useNotices (src/avisos/shared.jsx), chamado em AgendaAluno para
 * a aba mostrar o contador de novos mesmo quando o aluno está na Agenda.
 */
import { useEffect, useMemo, useState } from 'react'
import { BellOff, ExternalLink, Loader2, MessageCircle, Pin, Radio, RefreshCw } from 'lucide-react'
import { FILTERS, NoticeCard } from '../avisos/shared'
import { feedDate, fetchCommunityUrl } from '../lib/api/avisos'

const SEEN_KEY = (boxId) => `ds-agende:avisos-vistos:${boxId}`

/** Data do último aviso que o aluno já viu (localStorage; pode vir vazio). */
export function readSeen(boxId) {
  try {
    return localStorage.getItem(SEEN_KEY(boxId)) || ''
  } catch {
    return ''
  }
}
function writeSeen(boxId, iso) {
  try {
    localStorage.setItem(SEEN_KEY(boxId), iso)
  } catch {
    /* modo anônimo / storage bloqueado: só perde o contador */
  }
}
export const countUnseen = (rows, seen) => (seen ? rows.filter((n) => feedDate(n) > seen).length : 0)

export default function MuralAvisos({ box, notices }) {
  const { rows, status, error, live, reload } = notices
  const [filter, setFilter] = useState('todos')
  // o que era novo quando o aluno abriu o mural continua marcado como "Novo" enquanto ele está aqui
  const [seenAtOpen] = useState(() => readSeen(box.id))
  const [now, setNow] = useState(Date.now())
  const [community, setCommunity] = useState(null)

  useEffect(() => {
    let alive = true
    fetchCommunityUrl(box.id).then((u) => alive && setCommunity(u), () => {})
    return () => {
      alive = false
    }
  }, [box.id])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  // abriu o mural (ou chegou aviso com ele aberto) → tudo visto
  useEffect(() => {
    if (rows.length) writeSeen(box.id, rows.reduce((m, n) => (feedDate(n) > m ? feedDate(n) : m), ''))
  }, [box.id, rows])

  const test = FILTERS.find(([k]) => k === filter)[2]
  const { pinned, rest, counts } = useMemo(() => {
    const visible = rows.filter(test)
    return {
      pinned: visible.filter((n) => n.pinned),
      rest: visible.filter((n) => !n.pinned),
      counts: Object.fromEntries(FILTERS.map(([k, , t]) => [k, rows.filter(t).length])),
    }
  }, [rows, test])

  const isFresh = (n) => (seenAtOpen ? feedDate(n) > seenAtOpen : now - new Date(feedDate(n)) < 24 * 3600e3)

  return (
    <section>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase leading-tight">Mural do box</h1>
          <p className="text-sm text-fg-muted">Comunicados dos coaches do {box.name}</p>
        </div>
        <LiveDot live={live} onRetry={reload} />
      </div>

      {community && <CommunityBanner url={community} />}

      <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filtrar avisos">
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              filter === k ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line hover:text-fg'
            }`}
          >
            {l}
            {k !== 'todos' && counts[k] > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] ${filter === k ? 'bg-on-inverse/20' : 'bg-elevated'}`}>{counts[k]}</span>
            )}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="flex justify-center py-16 text-fg-muted">
          <Loader2 className="animate-spin" size={24} aria-label="Carregando" />
        </div>
      )}

      {status === 'error' && (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center text-sm text-fg-muted ring-1 ring-line">
          <RefreshCw size={24} className="text-fg-subtle" />
          {error}
          <button onClick={reload} className="font-semibold text-fg underline underline-offset-4">
            Tentar de novo
          </button>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-12 text-center ring-1 ring-line">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated">
            <BellOff size={22} className="text-fg-subtle" />
          </span>
          <div className="font-display text-lg font-bold uppercase">Nenhum aviso por enquanto</div>
          <p className="max-w-xs text-sm text-fg-muted">
            Quando os coaches publicarem horários especiais, eventos ou recados, eles aparecem aqui na hora.
          </p>
        </div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <>
          {pinned.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-highlight">
                <Pin size={12} className="fill-current" /> Fixados
              </h2>
              <div className="space-y-3">
                {pinned.map((n) => (
                  <NoticeCard key={n.id} n={n} fresh={isFresh(n)} now={now} />
                ))}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="mt-5">
              {pinned.length > 0 && <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-muted">Mais recentes</h2>}
              <div className="space-y-3">
                {rest.map((n) => (
                  <NoticeCard key={n.id} n={n} fresh={isFresh(n)} now={now} />
                ))}
              </div>
            </div>
          )}

          {!pinned.length && !rest.length && (
            <p className="py-10 text-center text-sm text-fg-subtle">Nenhum aviso nesta categoria.</p>
          )}
        </>
      )}
    </section>
  )
}

function CommunityBanner({ url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/15"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: '#128c4b' }}>
        <MessageCircle size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">Quer receber os avisos no celular?</span>
        <span className="block text-xs text-fg-muted">Entre na Comunidade do WhatsApp do box</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ background: '#128c4b' }}>
        Entrar <ExternalLink size={12} />
      </span>
    </a>
  )
}

function LiveDot({ live, onRetry }) {
  if (live === 'live') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300" title="Avisos novos aparecem sozinhos">
        <Radio size={12} /> Ao vivo
      </span>
    )
  }
  if (live === 'error') {
    return (
      <button onClick={onRetry} className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-fg-subtle hover:text-fg">
        <RefreshCw size={12} /> Atualizar
      </button>
    )
  }
  return null
}
