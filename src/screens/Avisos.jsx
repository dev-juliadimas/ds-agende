import { useState } from 'react'
import { Pin, MessageCircle } from 'lucide-react'
import { fmtDate } from '../lib/constants'
import { Chip } from '../components/ui'
import { BirthdaysCard } from '../components/Birthdays'

export const CATS = {
  feriado: { label: 'Feriado', cls: 'bg-rose-500/15 text-rose-300' },
  evento: { label: 'Evento', cls: 'bg-fuchsia-500/15 text-fuchsia-300' },
  aulao: { label: 'Aulão', cls: 'bg-accent/15 text-highlight' },
  geral: { label: 'Geral', cls: 'bg-line-strong/40 text-fg-soft' },
}

export function NoticeCard({ n, actions }) {
  return (
    <article className={`rounded-2xl p-4 ring-1 ${n.pinned ? 'bg-card ring-accent/40' : 'bg-card/60 ring-line'}`}>
      <div className="mb-2 flex items-center gap-2">
        {n.pinned && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-highlight">
            <Pin size={11} className="fill-highlight" /> Fixado
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CATS[n.category]?.cls}`}>{CATS[n.category]?.label}</span>
        <span className="ml-auto text-[10px] text-fg-subtle">
          {fmtDate(n.date)} • {n.author}
        </span>
      </div>
      <h3 className="font-display text-xl font-bold leading-tight">{n.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{n.body}</p>
      {n.whatsappSent && (
        <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-wa-light">
          <MessageCircle size={11} /> Enviado no WhatsApp{n.sentTo != null ? ` para ${n.sentTo} alunos` : ''}
        </p>
      )}
      {actions}
    </article>
  )
}

export default function Avisos({ db }) {
  const [cat, setCat] = useState('all')
  const list = [...db.notices].filter((n) => cat === 'all' || n.category === cat).sort((a, b) => b.pinned - a.pinned || b.date.localeCompare(a.date))
  return (
    <div className="px-5 pb-6 pt-4">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide">Mural do Box</h1>
      <p className="text-sm text-fg-muted">Comunicados oficiais dos coaches</p>
      <div className="mt-4">
        <BirthdaysCard db={db} />
      </div>
      <div className="mt-4 flex gap-1.5 overflow-x-auto no-scrollbar">
        <Chip active={cat === 'all'} onClick={() => setCat('all')}>
          Todos
        </Chip>
        {Object.entries(CATS).map(([k, v]) => (
          <Chip key={k} active={cat === k} onClick={() => setCat(k)}>
            {v.label}
          </Chip>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {list.map((n) => (
          <NoticeCard key={n.id} n={n} />
        ))}
        {!list.length && <p className="py-10 text-center text-sm text-fg-subtle">Nenhum aviso nesta categoria.</p>}
      </div>
    </div>
  )
}
