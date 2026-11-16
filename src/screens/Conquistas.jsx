import { useState } from 'react'
import { Flame, Camera as Instagram, Lock, Trophy, Medal, Share2, X, CheckCircle2, Award } from 'lucide-react'
import { BADGES, BADGE_CATS, BOX, ME_ID, PLANS, badgeValue, dayByKey, fmtDate } from '../lib/constants'
import { demoBoost, dismissCelebration, saveResult, toast } from '../lib/store'
import { Btn, Stat, inputCls } from '../components/ui'
import IndiqueGanhe from '../components/IndiqueGanhe'


export default function Conquistas({ db }) {
  const me = db.people[ME_ID]
  const [tab, setTab] = useState('selos')
  const [cat, setCat] = useState('todas')
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

      <div className="px-5 pb-4">
        <IndiqueGanhe db={db} />
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
          <div className="-mx-5 mb-3 flex gap-1.5 overflow-x-auto px-5 pb-1 scroll-thin">
            {[{ k: 'todas', emoji: '✨', short: 'Todas' }, ...BADGE_CATS].map((c) => (
              <button
                key={c.k}
                onClick={() => setCat(c.k)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ${cat === c.k ? 'bg-accent text-on-accent ring-accent' : 'bg-card text-fg-muted ring-line'}`}
              >
                {c.emoji} {c.short}
              </button>
            ))}
          </div>
          <div className="space-y-5">
            {BADGE_CATS.filter((c) => cat === 'todas' || cat === c.k).map((c) => (
              <BadgeGroup key={c.k} cat={c} me={me} />
            ))}
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
                🏆 10 treinos
              </Btn>
              <Btn variant="dark" className="px-3 py-1.5 text-xs" onClick={() => demoBoost('friday')}>
                🎉 5 sextas
              </Btn>
              <Btn variant="dark" className="px-3 py-1.5 text-xs" onClick={() => demoBoost('night')}>
                🦉 5 às 19:30
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

function BadgeGroup({ cat, me }) {
  const list = BADGES.filter((b) => b.cat === cat.k)
  const got = list.filter((b) => me.badges.includes(b.id)).length
  return (
    <section>
      <div className="mb-2 flex items-end justify-between">
        <h3 className="font-display text-lg font-extrabold uppercase leading-none">
          {cat.emoji} {cat.label}
        </h3>
        <span className="text-[11px] font-semibold text-fg-subtle">
          {got}/{list.length}
        </span>
      </div>
      <div className="space-y-2">
        {list.map((b) => (
          <BadgeRow key={b.id} b={b} me={me} />
        ))}
      </div>
    </section>
  )
}

function BadgeRow({ b, me }) {
  const got = me.badges.includes(b.id)
  const v = got ? b.goal : badgeValue(me, b)
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${got ? 'bg-card ring-accent/50' : 'bg-card/50 ring-line'}`}>
      <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-elevated text-2xl ${got ? '' : 'grayscale'}`}>
        <span className={got ? '' : 'opacity-40'}>{b.emoji}</span>
        {!got && <Lock size={11} className="absolute -right-1 -top-1 text-fg-subtle" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 font-display text-base font-bold leading-tight">{b.name}</div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${got ? 'bg-emerald-500/15 text-emerald-500' : 'bg-elevated text-fg-subtle'}`}>
            {got ? 'Conquistado' : 'Em andamento'}
          </span>
        </div>
        <div className="text-[11px] leading-snug text-fg-subtle">{b.desc}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
            <div className={`h-full rounded-full ${got ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${(v / b.goal) * 100}%` }} />
          </div>
          <span className="text-[10px] font-semibold text-fg-subtle">
            {v}/{b.goal}
          </span>
        </div>
      </div>
    </div>
  )
}

// "Selo do Dia" do treino: um selo novo desbloqueado tem prioridade; senão, um selo de presença pelo horário/dia
function daySeal(slot, newBadges, wodName) {
  const nb = newBadges.includes('first_wod') ? 'first_wod' : newBadges[0]
  if (nb) {
    const b = BADGES.find((x) => x.id === nb)
    return { emoji: b.emoji, name: b.name, desc: b.desc, isNew: true }
  }
  const day = dayByKey(slot.day).label
  if (slot.time === '06:00') return { emoji: '🌅', name: 'Madrugador das 06:00', desc: `Treinou cedo: ${wodName}` }
  if (slot.time === '12:10') return { emoji: '🥗', name: 'Almoço no Box', desc: `Pausa do almoço bem usada: ${wodName}` }
  if (slot.time === '19:30') return { emoji: '🦉', name: 'Corujão da Noite', desc: `Fechou o dia no box: ${wodName}` }
  if (slot.day === 'sab') return { emoji: '🏋️', name: 'Aulão de Sábado', desc: `Sábado concluído: ${wodName}` }
  return { emoji: '✅', name: `Check-in Confirmado — WOD de ${day}`, desc: wodName }
}

// Próximos selos ligados a este treino: horário, dia da semana, semana e próximo marco
function nextSeals(me, slot) {
  const pending = (b) => b && !me.badges.includes(b.id)
  const out = []
  const add = (b) => pending(b) && !out.includes(b) && out.push(b)
  add(BADGES.find((b) => b.cat === 'horario' && b.time === slot.time))
  add(BADGES.find((b) => b.metric === { seg: 'mondays', sex: 'fridays', sab: 'saturdays' }[slot.day]))
  BADGES.filter((b) => b.cat === 'semana').forEach(add)
  add(BADGES.find((b) => b.metric === 'total' && pending(b)))
  return out.slice(0, 3)
}

export function Celebration({ db, nav }) {
  const [story, setStory] = useState(false)
  const c = db.celebration
  if (!c) return null
  const me = db.people[ME_ID]
  const close = () => {
    setStory(false)
    dismissCelebration()
  }
  const seeAll = () => {
    close()
    nav?.('conquistas')
  }

  // Modo 1: pós check-in real (QR/GPS) → "Treino Concluído!"
  // Modo 2: selo avulso (atalhos da demo, check-in manual do coach, indicação)
  let seal, slot, extra, upcoming, sub
  if (typeof c === 'object' && c.kind === 'treino') {
    slot = db.slots.find((s) => s.id === c.slotId)
    const wod = db.wods[slot.day]
    seal = daySeal(slot, c.newBadges, wod?.name || 'WOD do dia')
    extra = c.newBadges.map((id) => BADGES.find((b) => b.id === id)).filter((b) => b.name !== seal.name)
    upcoming = nextSeals(me, slot)
    sub = `${dayByKey(slot.day).label} ${fmtDate(dayByKey(slot.day).date)} • ${slot.time} • via ${c.method === 'qr' ? 'QR Code' : 'GPS'}`
  } else {
    const b = BADGES.find((x) => x.id === c)
    seal = { ...b, isNew: true }
  }

  const share = async () => {
    const text = `${seal.emoji} ${slot ? 'Treino concluído no' : 'Desbloqueei o selo'} ${slot ? BOX.name : `"${seal.name}" no ${BOX.name}`}! ${slot ? `Selo do dia: ${seal.name}. ` : ''}${me.total} treino(s) concluído(s). #DSAgende`
    try {
      if (navigator.share) await navigator.share({ title: seal.name, text })
      else throw new Error()
    } catch {
      toast('Card pronto! Abrindo Instagram Stories… (simulado)')
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-6 backdrop-blur-sm">
      <button onClick={close} className="absolute right-4 top-14 z-10 rounded-full bg-card p-2 text-fg-soft" aria-label="Fechar">
        <X size={18} />
      </button>
      {story ? (
        <div className="animate-pop flex w-full max-w-[250px] flex-col items-center">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-ambar via-[#d8b382] to-[#c47a4a] p-5 text-ink shadow-2xl">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-[11px] font-extrabold leading-none text-ambar ring-2 ring-ink/20">
                {BOX.short
                  .split(' ')
                  .map((w) => w[0])
                  .join('')}
              </div>
              <div className="text-[10px] font-extrabold uppercase tracking-[.3em]">{BOX.short}</div>
            </div>
            {slot && <div className="mt-6 text-center text-[10px] font-extrabold uppercase tracking-[.25em]">Treino concluído 🔥</div>}
            <div className={`${slot ? 'mt-3' : 'mt-10'} text-center text-7xl`}>{seal.emoji}</div>
            <div className="mt-4 text-center font-display text-2xl font-extrabold uppercase leading-none">{seal.name}</div>
            <p className="mt-2 text-center text-xs font-semibold">{slot ? sub.split(' • via')[0] : seal.desc}</p>
            <div className="mt-5 rounded-2xl bg-ink/90 p-3 text-center text-cream">
              <div className="font-display text-4xl font-extrabold text-ambar">{me.total}</div>
              <div className="text-[10px] uppercase tracking-widest">treinos concluídos</div>
            </div>
            <div className="absolute inset-x-0 bottom-4 text-center text-[10px] font-bold">@icaracross • DS Agende</div>
          </div>
          <Btn className="mt-4 w-full bg-gradient-to-r from-fuchsia-500 via-rose-500 to-amber-400 text-white" onClick={share}>
            <Instagram size={16} /> Publicar nos Stories
          </Btn>
          <Btn variant="ghost" className="mt-2 w-full text-white" onClick={() => setStory(false)}>
            Voltar
          </Btn>
        </div>
      ) : (
        <div className="animate-pop my-auto w-full rounded-3xl bg-surface p-5 text-center ring-1 ring-accent/40">
          {slot ? (
            <>
              <h2 className="font-display text-3xl font-extrabold uppercase leading-none">Treino Concluído! 🔥</h2>
              <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-fg-muted">
                <CheckCircle2 size={12} className="text-emerald-500" /> {sub}
              </p>
            </>
          ) : (
            <div className="text-[10px] font-bold uppercase tracking-[.25em] text-highlight">Novo selo desbloqueado</div>
          )}

          <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-line">
            {slot && <div className="text-[10px] font-bold uppercase tracking-[.2em] text-highlight">{seal.isNew ? 'Novo selo • Selo do dia' : 'Selo do dia'}</div>}
            <div className="my-2 text-6xl drop-shadow-[0_0_25px_rgba(200,255,46,.45)]">{seal.emoji}</div>
            <div className="font-display text-2xl font-extrabold uppercase leading-tight">{seal.name}</div>
            <p className="mt-0.5 text-xs text-fg-muted">{seal.desc}</p>
            {!!extra?.length && (
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                {extra.map((b) => (
                  <span key={b.id} className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-highlight">
                    + {b.emoji} {b.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {!!upcoming?.length && (
            <div className="mt-3 space-y-2 text-left">
              <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Próximos selos</div>
              {upcoming.map((b) => {
                const v = badgeValue(me, b)
                return (
                  <div key={b.id}>
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold">
                        {b.emoji} {v}/{b.goal} {b.unit} para {b.name}
                      </span>
                      <span className="text-fg-subtle">{Math.round((v / b.goal) * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(v / b.goal) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <Btn className="w-full" onClick={() => setStory(true)}>
              <Share2 size={16} /> Compartilhar nos Stories
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={seeAll}>
              <Award size={16} /> Ver todas as conquistas
            </Btn>
          </div>
          {seal.isNew && (
            <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-fg-subtle">
              <Medal size={11} /> Também enviado no seu WhatsApp
            </p>
          )}
        </div>
      )}
    </div>
  )
}
