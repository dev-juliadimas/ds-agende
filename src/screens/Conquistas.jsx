import { useState } from 'react'
import { Flame, Camera as Instagram, Lock, Trophy, Medal, Share2, X } from 'lucide-react'
import { BADGES, BOX, ME_ID, PLANS, dayByKey } from '../lib/constants'
import { demoBoost, dismissCelebration, saveResult, toast } from '../lib/store'
import { Btn, Stat, inputCls } from '../components/ui'

const metricOf = (p, m) => ({ total: p.total, early: p.early, week: p.week, referrals: p.referrals || 0 })[m] || 0

export default function Conquistas({ db }) {
  const me = db.people[ME_ID]
  const [tab, setTab] = useState('selos')
  const ranking = Object.values(db.people)
    .filter((p) => p.role === 'aluno')
    .sort((a, b) => b.monthCount - a.monthCount || b.streak - a.streak)
  const myPos = ranking.findIndex((p) => p.id === ME_ID) + 1
  const done = db.bookings.filter((b) => b.personId === ME_ID && b.status === 'presente').map((b) => ({ ...b, slot: db.slots.find((s) => s.id === b.slotId) }))

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-b from-accent/20 to-transparent px-5 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent font-display text-2xl font-extrabold text-ink">MC</div>
          <div>
            <h1 className="font-display text-2xl font-extrabold uppercase leading-none">{me.name}</h1>
            <p className="text-xs text-fg-muted">
              Plano {PLANS[me.plan].label} • aluna desde {me.since.split('-').reverse().slice(0, 2).join('/')}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <Stat label="Treinos" value={me.total} />
          <Stat label="Sequência" value={<span className="flex items-center gap-0.5">{me.streak}<Flame size={16} className="text-orange-400" /></span>} />
          <Stat label="No mês" value={me.monthCount} />
          <Stat label="Faltas" value={me.monthNoShows || 0} accent={me.monthNoShows ? 'text-rose-400' : 'text-fg'} />
        </div>
      </div>

      <div className="mx-5 flex rounded-xl bg-card p-1 ring-1 ring-line">
        {[
          ['selos', 'Selos'],
          ['ranking', 'Ranking'],
          ['wod', 'Meus WODs'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase ${tab === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'selos' && (
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-2.5">
            {BADGES.map((b) => {
              const got = me.badges.includes(b.id)
              const v = Math.min(b.goal, metricOf(me, b.metric))
              return (
                <div key={b.id} className={`relative rounded-2xl p-3 ring-1 ${got ? 'bg-card ring-accent/50' : 'bg-card/50 ring-line'}`}>
                  <div className={`text-3xl ${got ? '' : 'opacity-25 grayscale'}`}>{b.emoji}</div>
                  {!got && <Lock size={12} className="absolute right-3 top-3 text-fg-subtle" />}
                  <div className="mt-1 font-display text-lg font-bold leading-tight">{b.name}</div>
                  <div className="text-[11px] leading-snug text-fg-subtle">{b.desc}</div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-elevated">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(v / b.goal) * 100}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-fg-subtle">
                    {v}/{b.goal}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-dashed border-line p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Atalhos da demonstração</p>
            <div className="flex flex-wrap gap-1.5">
              <Btn variant="dark" className="px-3 py-1.5 text-xs" onClick={() => demoBoost('early')}>
                🔥 5 treinos às 06h
              </Btn>
              <Btn variant="dark" className="px-3 py-1.5 text-xs" onClick={() => demoBoost('week')}>
                ⚡ 5 na semana
              </Btn>
              <Btn variant="dark" className="px-3 py-1.5 text-xs" onClick={() => demoBoost('ten')}>
                🏆 10 aulas
              </Btn>
            </div>
          </div>
        </div>
      )}

      {tab === 'ranking' && (
        <div className="px-5 pt-4">
          <p className="mb-3 text-xs text-fg-muted">
            <Trophy size={12} className="mr-1 inline text-highlight" /> Ranking de assiduidade de novembro — conta presença, não performance. Constância vence!
          </p>
          <div className="mb-3 flex items-end justify-center gap-2">
            {[1, 0, 2].map((i) => {
              const p = ranking[i]
              const h = ['h-24', 'h-16', 'h-12'][i]
              return (
                <div key={p.id} className="flex w-24 flex-col items-center">
                  <span className="text-2xl">{['🥇', '🥈', '🥉'][i]}</span>
                  <span className="truncate text-xs font-semibold">{p.name.split(' ')[0]}</span>
                  <div className={`mt-1 flex w-full items-start justify-center rounded-t-xl bg-card pt-2 font-display text-xl font-bold ring-1 ring-line ${h}`}>{p.monthCount}</div>
                </div>
              )
            })}
          </div>
          <ol className="space-y-1.5">
            {ranking.slice(3, 12).map((p, i) => (
              <RankRow key={p.id} p={p} pos={i + 4} />
            ))}
          </ol>
          {myPos > 12 && (
            <div className="mt-3">
              <RankRow p={me} pos={myPos} highlight />
              <p className="mt-2 text-center text-[11px] text-fg-subtle">Cada presença confirmada te faz subir. Bora! 🚀</p>
            </div>
          )}
        </div>
      )}

      {tab === 'wod' && (
        <div className="space-y-2.5 px-5 pt-4">
          {!done.length && <p className="py-8 text-center text-sm text-fg-subtle">Confirme presença em uma aula para registrar seu tempo/carga no WOD.</p>}
          {done.map((b) => (
            <ResultRow key={b.id} b={b} wod={db.wods[b.slot.day]} />
          ))}
        </div>
      )}
    </div>
  )
}

function RankRow({ p, pos, highlight }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ${highlight || p.id === ME_ID ? 'bg-accent/10 ring-accent/40' : 'bg-card/60 ring-line'}`}>
      <span className="w-6 font-display text-lg font-bold text-fg-subtle">{pos}</span>
      <span className="flex-1 truncate text-sm font-medium">{p.id === ME_ID ? `${p.name} (você)` : p.name}</span>
      <span className="text-[11px] text-fg-subtle">
        {p.streak > 0 && (
          <>
            {p.streak}
            <Flame size={11} className="mb-0.5 inline text-orange-400" />{' '}
          </>
        )}
      </span>
      <span className="font-display text-lg font-bold">{p.monthCount}</span>
    </li>
  )
}

function ResultRow({ b, wod }) {
  const [v, setV] = useState(b.result || '')
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-line">
      <div className="flex justify-between text-xs text-fg-muted">
        <span>
          {dayByKey(b.slot.day).label} • {b.slot.time}
        </span>
        <span className="text-highlight">✓ via {b.checkin?.method === 'qr' ? 'QR Code' : b.checkin?.method === 'gps' ? 'GPS' : 'coach'}</span>
      </div>
      <div className="font-display text-xl font-bold">{wod.name}</div>
      <div className="mt-2 flex gap-2">
        <input className={inputCls} placeholder={wod.type === 'AMRAP' ? 'Rounds + reps (ex.: 18+7)' : 'Tempo ou carga (ex.: 7:42 • 43 kg)'} value={v} onChange={(e) => setV(e.target.value)} />
        <Btn onClick={() => saveResult(b.id, v)} disabled={!v}>
          Salvar
        </Btn>
      </div>
    </div>
  )
}

export function Celebration({ db }) {
  const [story, setStory] = useState(false)
  const id = db.celebration
  if (!id) return null
  const b = BADGES.find((x) => x.id === id)
  const me = db.people[ME_ID]
  const close = () => {
    setStory(false)
    dismissCelebration()
  }
  const share = async () => {
    const text = `${b.emoji} Desbloqueei o selo "${b.name}" no ${BOX.name}! ${me.total} treino(s) concluído(s). #DSAgende`
    try {
      if (navigator.share) await navigator.share({ title: b.name, text })
      else throw new Error()
    } catch {
      toast('Card pronto! Abrindo Instagram Stories… (simulado)')
    }
  }
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <button onClick={close} className="absolute right-4 top-14 rounded-full bg-card p-2 text-fg-soft" aria-label="Fechar">
        <X size={18} />
      </button>
      {story ? (
        <div className="animate-pop flex w-full max-w-[250px] flex-col items-center">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-ambar via-[#d8b382] to-[#c47a4a] p-5 text-ink shadow-2xl">
            <div className="text-[10px] font-extrabold uppercase tracking-[.3em]">{BOX.short}</div>
            <div className="mt-10 text-center text-7xl">{b.emoji}</div>
            <div className="mt-4 text-center font-display text-3xl font-extrabold uppercase leading-none">{b.name}</div>
            <p className="mt-2 text-center text-xs font-semibold">{b.desc}</p>
            <div className="mt-6 rounded-2xl bg-ink/90 p-3 text-center text-cream">
              <div className="font-display text-4xl font-extrabold text-ambar">{me.total}</div>
              <div className="text-[10px] uppercase tracking-widest">treinos concluídos</div>
            </div>
            <div className="absolute inset-x-0 bottom-4 text-center text-[10px] font-bold">@icaracross • DS Agende</div>
          </div>
          <Btn className="mt-4 w-full bg-gradient-to-r from-fuchsia-500 via-rose-500 to-amber-400 text-white" onClick={share}>
            <Instagram size={16} /> Publicar nos Stories
          </Btn>
        </div>
      ) : (
        <div className="animate-pop w-full rounded-3xl bg-surface p-6 text-center ring-1 ring-accent/40">
          <div className="text-[10px] font-bold uppercase tracking-[.25em] text-highlight">Novo selo desbloqueado</div>
          <div className="my-4 text-7xl drop-shadow-[0_0_25px_rgba(200,255,46,.45)]">{b.emoji}</div>
          <h2 className="font-display text-3xl font-extrabold uppercase">{b.name}</h2>
          <p className="mt-1 text-sm text-fg-muted">{b.desc}</p>
          <div className="mt-5 space-y-2">
            <Btn className="w-full" onClick={() => setStory(true)}>
              <Share2 size={16} /> Compartilhar no Instagram Stories
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={close}>
              Continuar
            </Btn>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-fg-subtle">
            <Medal size={11} /> Também enviado no seu WhatsApp
          </p>
        </div>
      )}
    </div>
  )
}
