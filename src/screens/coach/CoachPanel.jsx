import { useState } from 'react'
import { BarChart3, Bot, ClipboardList, Megaphone, SlidersHorizontal, Wallet } from 'lucide-react'
import Turmas from './Turmas'
import Capacidade from './Capacidade'
import Metricas from './Metricas'
import AvisosAdmin from './AvisosAdmin'
import Financeiro from './Financeiro'
import BotCustos from './BotCustos'

const TABS = [
  { k: 'turmas', l: 'Turmas', i: ClipboardList, C: Turmas },
  { k: 'cap', l: 'Capacidade', i: SlidersHorizontal, C: Capacidade },
  { k: 'financeiro', l: 'Financeiro', i: Wallet, C: Financeiro },
  { k: 'metricas', l: 'Métricas', i: BarChart3, C: Metricas },
  { k: 'bot', l: 'Bot & Custos', i: Bot, C: BotCustos },
  { k: 'avisos', l: 'Avisos', i: Megaphone, C: AvisosAdmin },
]

export default function CoachPanel({ db, tab, setTab }) {
  const [local, setLocal] = useState('turmas')
  const t = tab ?? local
  const set = setTab ?? setLocal
  const C = TABS.find((x) => x.k === t).C
  return (
    <div className="pb-6">
      <div className="px-5 pt-4">
        <div className="text-[10px] font-bold uppercase tracking-[.25em] text-highlight">Painel Coach / Gestão</div>
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide">Içara Cross</h1>
      </div>
      <div className="sticky top-0 z-20 mt-3 bg-canvas/95 px-5 py-2 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
          {TABS.map(({ k, l, i: Icon }) => (
            <button key={k} onClick={() => set(k)} className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold uppercase ${t === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted'}`}>
              <Icon size={15} />
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 pt-2">
        <C db={db} />
      </div>
    </div>
  )
}
