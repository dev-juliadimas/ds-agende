import { Cake } from 'lucide-react'
import { dayByKey } from '../lib/constants'
import { monthBirthdays } from '../lib/store'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Lista do mês. Mostra só dia/mês — o ano de nascimento não aparece para ninguém.
export function BirthdaysCard({ db, compact = false }) {
  const list = monthBirthdays(db)
  const month = MONTHS[Number(dayByKey(db.now.day).date.slice(5, 7)) - 1]
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-line" aria-label={`Aniversariantes de ${month}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-highlight">
          <Cake size={16} />
        </span>
        <div>
          <h3 className="font-display text-lg leading-none">Aniversariantes de {month}</h3>
          <p className="text-[11px] text-fg-subtle">{list.length} {list.length === 1 ? 'pessoa' : 'pessoas'} do box</p>
        </div>
      </div>
      <ul className={`space-y-1.5 ${compact ? 'max-h-56 overflow-y-auto scroll-thin pr-1' : ''}`}>
        {list.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${p.isToday ? 'bg-accent/15 ring-1 ring-accent/50' : 'bg-elevated/60'} ${p.passed && !p.isToday ? 'opacity-60' : ''}`}
          >
            <span className="w-8 shrink-0 text-center font-display text-lg leading-none text-highlight">{p.bday}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            {p.isToday && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-on-accent">🎂 Hoje</span>}
          </li>
        ))}
        {!list.length && <li className="py-3 text-center text-xs text-fg-subtle">Ninguém faz aniversário este mês.</li>}
      </ul>
    </section>
  )
}
