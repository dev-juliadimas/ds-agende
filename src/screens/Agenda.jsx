import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, ChevronRight, Clock, Globe2, MapPin, QrCode, Repeat, ScanLine, UserPlus, Users, Zap, Hourglass, ArrowLeftRight, XCircle, Lock } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { BOX, DAYS, LEVELS, ME_ID, PENALTIES, PLANS, TRIAL_LEVELS, WEEKDAY_TIMES, brl, dayByKey, dayIndex, fmtDate } from '../lib/constants'
import {
  book,
  canBook,
  canCancel,
  cancel,
  checkin,
  createDropin,
  createTrial,
  checkinGPS,
  checkinRealGPS,
  checkinSimulatedGPS,
  gpsEnabled,
  gpsRadius,
  fmtDist,
  gpsCheck,
  setRealGps,
  joinWaitlist,
  leaveWaitlist,
  minutesUntil,
  myBookings,
  billingStatus,
  priceOf,
  removeRecurrence,
  salesStatus,
  scanQR,
  setRecurrence,
  slotCounts,
  slotStatus,
  swap,
  toast,
  weeklyCount,
  fmtHours,
  bookingWindow,
  activeStories,
  markStorySeen,
  activePenalty,
  absLabel,
  weeklyLimit,
} from '../lib/store'
import { Alert, Btn, CapacityBar, Chip, Field, LevelTag, Logo, ModalityTag, Sheet, inputCls } from '../components/ui'
import { StoriesBar } from '../components/Stories'
import Checkout from '../components/Checkout'

export default function Agenda({ db, nav = () => {} }) {
  const [day, setDay] = useState(db.now.day)
  const [level, setLevel] = useState('all')
  const [openSlot, setOpenSlot] = useState(null)
  const [sheet, setSheet] = useState(null) // 'trial' | 'dropin' | 'scan' | 'gps' | 'recurring'
  const [extraSlot, setExtraSlot] = useState(null) // treino extra avulso (Pix/Cartão/Recepção)
  useEffect(() => {
    setDay(db.now.day)
  }, [db.now.day])

  const me = db.people[ME_ID]
  const mine = myBookings(db)
  const upcoming = mine.filter((b) => ['open', 'live'].includes(slotStatus(db, b.slot)))
  const next = upcoming[0]
  // Box pré-configurado: o filtro é por modalidade (CROSS, HY-FITNESS…) em vez de nível
  const mods = db.preset?.modalities
  const slots = db.slots.filter((s) => s.day === day && (level === 'all' || (mods ? s.modality === level : s.level === level)))
  const wod = db.wods[day]
  const used = weeklyCount(db, ME_ID)
  const limit = weeklyLimit(db, ME_ID)

  return (
    <div className="pb-6">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-b from-card to-transparent px-5 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="h-11 w-auto" boxClassName="-my-2 h-16 w-16" alt="DS Agende" />
            <div>
            <p className="text-xs text-fg-muted">Bom treino,</p>
            <h1 className="font-display text-3xl font-extrabold uppercase leading-none tracking-wide">{me.name.split(' ')[0]} 💪</h1>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Plano {me.planName || PLANS[me.plan].label}</div>
            <div className="font-display text-lg font-bold">
              <span className={used >= limit ? 'text-rose-400' : 'text-highlight'}>{used}</span>
              <span className="text-fg-subtle">/{limit === Infinity ? '∞' : limit} na semana</span>
            </div>
          </div>
        </div>

        <BillingBanner db={db} nav={nav} />
        <NoShowBanner db={db} />

        {/* Stories dos coaches */}
        <div className="-mx-5 mt-3">
          <StoriesBar db={db} />
        </div>

        {/* Próximo treino + check-in */}
        {next ? (
          <div className="mt-4 rounded-2xl bg-accent p-4 text-ink">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                  {next.status === 'presente' ? 'Presença confirmada ✓' : slotStatus(db, next.slot) === 'live' ? 'Acontecendo agora' : 'Seu próximo treino'}
                </div>
                <div className="font-display text-3xl font-extrabold leading-tight">
                  {dayByKey(next.slot.day).short} {next.slot.time}
                </div>
                <div className="text-xs font-semibold opacity-80">
                  {mods?.[next.slot.modality]?.label || LEVELS[next.slot.level].label} • {next.slot.coach}
                </div>
              </div>
              <div className="rounded-xl bg-ink/10 px-2 py-1 text-right text-[11px] font-bold">
                <Clock size={12} className="mb-0.5 inline" /> {fmtUntil(minutesUntil(db, next.slot))}
              </div>
            </div>
            {next.status !== 'presente' && (
              <>
                {gpsEnabled(db) ? (
                  <button
                    onClick={() => setSheet('gps')}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 font-display text-xl font-extrabold uppercase tracking-wide text-ambar shadow-lg active:scale-[.98]"
                  >
                    <MapPin size={20} /> Estou aqui
                  </button>
                ) : (
                  <button
                    onClick={() => setSheet('scan')}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 font-display text-xl font-extrabold uppercase tracking-wide text-ambar shadow-lg active:scale-[.98]"
                  >
                    <ScanLine size={20} /> Ler QR Code
                  </button>
                )}
                <GpsCheckinRow db={db} booking={next} onQR={() => setSheet('scan')} />
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-fg-muted">
            <b className="text-fg">Nenhuma reserva ativa.</b> Escolha um horário abaixo — dica: a turma de <b className="text-highlight">Quinta 06:00</b> está aberta para testar o check-in por localização (“Estou aqui”).
          </div>
        )}
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-3 gap-2 px-5">
        <Quick icon={UserPlus} label="Aula experimental" onClick={() => setSheet('trial')} />
        <Quick icon={Globe2} label="Drop-in" onClick={() => setSheet('dropin')} />
        <Quick icon={Repeat} label="Reserva fixa" onClick={() => setSheet('recurring')} />
      </div>

      {/* Filtros */}
      <div className="mt-5 flex gap-1.5 overflow-x-auto px-5 no-scrollbar">
        {DAYS.map((d) => {
          const past = dayIndex(d.key) < dayIndex(db.now.day)
          const locked = dayIndex(d.key) - dayIndex(db.now.day) > db.settings.bookAheadDays
          return (
            <button
              key={d.key}
              onClick={() => setDay(d.key)}
              className={`flex min-w-[52px] flex-col items-center rounded-2xl py-2 transition ${day === d.key ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-soft ring-1 ring-line'} ${past ? 'opacity-50' : ''}`}
            >
              <span className="flex items-center gap-0.5 text-[10px] font-bold">
                {locked && <Lock size={9} aria-label="agenda ainda fechada" />}
                {d.short}
              </span>
              <span className="font-display text-xl font-bold leading-none">{d.date.slice(8)}</span>
              {d.key === db.now.day && <span className={`mt-0.5 h-1 w-1 rounded-full ${day === d.key ? 'bg-on-inverse' : 'bg-accent'}`} />}
            </button>
          )
        })}
      </div>
      <div className="mt-2.5 flex gap-1.5 overflow-x-auto px-5 no-scrollbar">
        <Chip active={level === 'all'} onClick={() => setLevel('all')}>
          Todos
        </Chip>
        {mods
          ? Object.entries(mods)
              .filter(([k]) => db.slots.some((s) => s.modality === k))
              .map(([k, v]) => (
                <Chip key={k} active={level === k} onClick={() => setLevel(k)}>
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full ring-1 ring-fg/30" style={{ backgroundColor: v.color }} />
                  {v.label}
                </Chip>
              ))
          : Object.entries(LEVELS).map(([k, v]) => (
              <Chip key={k} active={level === k} onClick={() => setLevel(k)}>
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${v.dot}`} />
                {v.short}
              </Chip>
            ))}
      </div>

      {/* WOD do dia */}
      <div className="mx-5 mt-4 overflow-hidden rounded-2xl bg-card ring-1 ring-line">
        <div className="flex items-center justify-between bg-elevated/60 px-4 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">WOD • {dayByKey(day).label}</span>
          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-highlight">{wod.type}</span>
        </div>
        <div className="px-4 py-3">
          <div className="font-display text-2xl font-extrabold tracking-wide">{wod.name}</div>
          <p className="text-xs text-fg-muted">{wod.desc}</p>
        </div>
      </div>

      {/* Grade */}
      <div className="mt-4 space-y-2.5 px-5">
        {slots.length === 0 && <p className="py-8 text-center text-sm text-fg-subtle">Nenhum horário com esse filtro.</p>}
        {slots.map((s) => (
          <SlotCard key={s.id} db={db} slot={s} onOpen={() => setOpenSlot(s.id)} />
        ))}
      </div>

      <BookingSheet
        db={db}
        slotId={openSlot}
        onClose={() => setOpenSlot(null)}
        nav={nav}
        onExtra={(id) => {
          setOpenSlot(null)
          setExtraSlot(id)
        }}
      />
      <TrialSheet db={db} open={sheet === 'trial'} onClose={() => setSheet(null)} />
      <DropinSheet db={db} open={sheet === 'dropin'} onClose={() => setSheet(null)} />
      <RecurringSheet db={db} open={sheet === 'recurring'} onClose={() => setSheet(null)} />
      <ScanSheet db={db} open={sheet === 'scan'} onClose={() => setSheet(null)} />
      <LocationSheet db={db} booking={next} open={sheet === 'gps'} onClose={() => setSheet(null)} onQR={() => setSheet('scan')} />
      <Checkout
        db={db}
        open={!!extraSlot}
        onClose={() => setExtraSlot(null)}
        kind="extra"
        slotId={extraSlot}
        title="Treino extra avulso"
        intro={<p className="text-sm text-fg-muted">O limite semanal do seu plano acabou. Libere este treino a mais pagando só esta aula.</p>}
      />
    </div>
  )
}

/* Aviso de mensalidade: carência (treina normalmente) ou bloqueio */
function BillingBanner({ db, nav }) {
  const bs = billingStatus(db, ME_ID)
  if (bs.status === 'pago' || bs.status === 'na') return null
  const blocked = bs.status === 'bloqueado'
  return (
    <button
      onClick={() => nav('planos')}
      className={`mt-3 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 ${blocked ? 'bg-rose-500/15 ring-rose-500/40' : 'bg-amber-500/10 ring-amber-500/30'}`}
    >
      <span className="text-2xl">{blocked ? '🔒' : '⏳'}</span>
      <span className="min-w-0 flex-1 text-xs">
        <b className={blocked ? 'text-rose-300' : 'text-amber-200'}>{blocked ? 'Acesso bloqueado' : `Mensalidade vencida em ${fmtDate(bs.due)}`}</b>
        <span className="block text-fg-muted">
          {blocked
            ? 'Reservas suspensas e vagas futuras liberadas. Pague para voltar a treinar.'
            : bs.left === 0
              ? 'Hoje é o último dia de carência. Você ainda pode treinar.'
              : `Você segue treinando por mais ${bs.left} dia(s) de carência.`}
        </span>
      </span>
      <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${blocked ? 'bg-rose-500 text-white' : 'bg-accent text-ink'}`}>Pagar</span>
    </button>
  )
}

/* Regra Anti-Falta: penalidade em vigor ou alerta de quantas faltas o aluno já tem no mês */
function NoShowBanner({ db }) {
  const rule = db.settings.noShowRule
  const me = db.people[ME_ID]
  const pen = activePenalty(db, ME_ID)
  const n = me.monthNoShows || 0
  if (pen) {
    const detail = {
      block48: `Até ${absLabel(pen.untilAbs)} você só reserva aulas do próprio dia.`,
      loseRecurring: 'Sua reserva fixa foi desativada neste mês. Reservas avulsas seguem liberadas.',
      deductWeekly: `Seu pacote desta semana ficou com ${weeklyLimit(db, ME_ID)} aula(s).`,
    }[pen.type]
    return (
      <div role="alert" className="mt-3 flex items-start gap-3 rounded-2xl bg-rose-500/15 px-3 py-2.5 text-xs ring-1 ring-rose-500/40">
        <span className="text-2xl leading-none">⚠️</span>
        <span className="min-w-0 flex-1">
          <b className="text-rose-700 dark:text-rose-300">
            Você atingiu {pen.count} faltas sem aviso este mês. {PENALTIES[pen.type].short}.
          </b>
          <span className="block text-fg-muted">
            {detail} Teve um imprevisto? Fale com o coach para abonar a falta.
          </span>
        </span>
      </div>
    )
  }
  if (!rule.enabled || n === 0) return null
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs ring-1 ring-amber-500/30">
      <span className="text-xl leading-none">⏰</span>
      <span className="min-w-0 flex-1 text-fg-muted">
        <b className="text-amber-700 dark:text-amber-200">
          {n} de {rule.tolerance} faltas sem aviso este mês.
        </b>{' '}
        Ao chegar a {rule.tolerance}: {PENALTIES[rule.penalty].label.toLowerCase()}. Cancele até {fmtHours(db.settings.minCancelHours)} antes para não contar.
      </span>
    </div>
  )
}

function fmtUntil(m) {
  if (m <= 0) return 'agora'
  if (m < 60) return `em ${m} min`
  if (m < 1440) return `em ${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
  return `em ${Math.round(m / 1440)}d`
}

function Quick({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-2xl bg-card py-3 text-[11px] font-semibold text-fg-soft ring-1 ring-line transition hover:bg-elevated">
      <Icon size={18} className="text-highlight" />
      {label}
    </button>
  )
}

function SlotCard({ db, slot, onOpen }) {
  const c = slotCounts(db, slot.id)
  const st = slotStatus(db, slot)
  const mine = db.bookings.find((b) => b.slotId === slot.id && b.personId === ME_ID && ['reservado', 'presente', 'pre_reserva'].includes(b.status))
  const waiting = (db.waitlist[slot.id] || []).indexOf(ME_ID)
  const past = st === 'past' || st === 'closed'
  const win = bookingWindow(db, slot)
  return (
    <button
      key={db.flash[slot.id]}
      onClick={onOpen}
      className={`${db.flash[slot.id] ? 'animate-flash' : ''} flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition ${mine ? 'bg-accent/10 ring-accent/50' : 'bg-card/70 ring-line hover:ring-line-strong'} ${past ? 'opacity-45' : ''}`}
    >
      <div className="w-[62px] shrink-0 text-center">
        <div className="font-display text-[26px] font-extrabold leading-none">{slot.time}</div>
        <div className="mt-1 text-[10px] text-fg-subtle">{slot.coach.replace('Coach ', '')}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {slot.modality ? <ModalityTag modality={slot.modality} info={db.preset?.modalities?.[slot.modality]} /> : <LevelTag level={slot.level} size="xs" />}
          {slot.special && <span className="rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fuchsia-300">{slot.special}</span>}
          {slot.override != null && <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-300">Lotação ajustada</span>}
          {!past && !salesStatus(db, slot).open && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-bold uppercase text-fg-muted" title={salesStatus(db, slot).reason}>
              <Lock size={9} /> Venda bloqueada
            </span>
          )}
        </div>
        <div className="mt-2">
          <CapacityBar taken={c.taken} cap={c.cap} />
        </div>
      </div>
      <div className="w-[64px] shrink-0 text-right text-[10px] font-bold uppercase">
        {past ? (
          <span className="text-fg-subtle">Encerrada</span>
        ) : mine ? (
          <span className={mine.status === 'pre_reserva' ? 'text-amber-300' : 'text-highlight'}>{mine.status === 'presente' ? '✓ Presente' : mine.status === 'pre_reserva' ? '⏳ Pagar' : '✓ Inscrito'}</span>
        ) : !win.open ? (
          <span className="flex flex-col items-end text-fg-subtle">
            <Lock size={12} /> Abre {win.opensOn.short.toLowerCase()}
          </span>
        ) : st === 'live' ? (
          <span className="text-amber-300">Em curso</span>
        ) : waiting >= 0 ? (
          <span className="text-amber-300">Espera #{waiting + 1}</span>
        ) : c.free === 0 ? (
          <span className="text-rose-400">Lotada</span>
        ) : (
          <span className="flex items-center justify-end text-fg-soft">
            Reservar <ChevronRight size={14} />
          </span>
        )}
      </div>
    </button>
  )
}

/* ---------------- Reserva / troca / cancelamento ---------------- */
function BookingSheet({ db, slotId, onClose, onExtra, nav }) {
  const [swapTo, setSwapTo] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    setErr('')
    setSwapTo('')
  }, [slotId])
  if (!slotId) return null
  const slot = db.slots.find((s) => s.id === slotId)
  const c = slotCounts(db, slotId)
  const st = slotStatus(db, slot)
  const mine = db.bookings.find((b) => b.slotId === slotId && b.personId === ME_ID && ['reservado', 'presente', 'pre_reserva'].includes(b.status))
  const check = canBook(db, slotId, ME_ID)
  const wpos = (db.waitlist[slotId] || []).indexOf(ME_ID)
  const cc = mine ? canCancel(db, mine) : null
  const sameDay = db.slots.filter((s) => s.day === slot.day && s.id !== slot.id && slotStatus(db, s) === 'open')
  const wod = db.wods[slot.day]

  const doBook = () => {
    const r = book({ slotId, personId: ME_ID, source: 'web' })
    if (r.ok) {
      toast(`Reserva confirmada: ${dayByKey(slot.day).short} ${slot.time} ✅`)
      onClose()
    } else setErr(r.msg)
  }

  return (
    <Sheet open onClose={onClose} title={`${dayByKey(slot.day).label} • ${slot.time}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <LevelTag level={slot.level} />
          <span className="text-xs text-fg-muted">
            <Users size={12} className="inline" /> {slot.coach}
          </span>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
          <div className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle">WOD do dia • {wod.type}</div>
          <div className="font-display text-2xl font-extrabold">{wod.name}</div>
          <p className="text-xs text-fg-muted">{wod.desc}</p>
          {slot.level === 'scaled' && <p className="mt-2 text-[11px] text-amber-300">Versão Scaled: cargas e movimentos adaptados.</p>}
          {slot.level === 'iniciante' && <p className="mt-2 text-[11px] text-emerald-300">Turma com foco em técnica — ideal para experimentais.</p>}
        </div>
        <CapacityBar taken={c.taken} cap={c.cap} trials={c.trials} quota={slot.trialQuota} />
        {c.waitlist > 0 && <p className="text-[11px] text-fg-subtle">{c.waitlist} pessoa(s) na lista de espera</p>}

        {err && <Alert kind="err">{err}</Alert>}

        {mine?.status === 'pre_reserva' ? (
          <Alert kind="warn">⏳ Vaga pré-reservada aguardando o pagamento do treino extra. Se não for pago em 15 min, ela volta para a grade.</Alert>
        ) : mine ? (
          <div className="space-y-3">
            <Alert kind="ok">
              {mine.status === 'presente' ? '✅ Presença confirmada nesta aula.' : `Você está inscrito(a)${mine.type === 'recorrente' ? ' (reserva fixa 🔁)' : ''}. Reservado via ${mine.source === 'whatsapp' ? 'WhatsApp' : 'app'}.`}
            </Alert>
            {mine.status === 'reservado' && (
              <>
                {!cc.ok && (
                  <Alert kind="warn">
                    <Lock size={12} className="mr-1 inline" />
                    {cc.msg} Faltam {Math.max(0, cc.minutesLeft)} min.
                  </Alert>
                )}
                <div className="flex gap-2">
                  <select className={inputCls} value={swapTo} onChange={(e) => setSwapTo(e.target.value)} disabled={!cc.ok}>
                    <option value="">Trocar para outro horário…</option>
                    {sameDay.map((s) => {
                      const k = slotCounts(db, s.id)
                      return (
                        <option key={s.id} value={s.id} disabled={k.free === 0}>
                          {s.time} • {LEVELS[s.level].short} • {k.free} vagas
                        </option>
                      )
                    })}
                  </select>
                  <Btn
                    variant="dark"
                    disabled={!swapTo || !cc.ok}
                    onClick={() => {
                      const r = swap(mine.id, swapTo)
                      if (r.ok) {
                        toast('Horário trocado! Vaga antiga liberada na hora.')
                        onClose()
                      } else setErr(r.msg)
                    }}
                  >
                    <ArrowLeftRight size={16} />
                  </Btn>
                </div>
                <Btn
                  variant="danger"
                  className="w-full"
                  disabled={!cc.ok}
                  onClick={() => {
                    const r = cancel(mine.id)
                    if (r.ok) {
                      toast('Reserva cancelada. Vaga liberada para a lista de espera.')
                      onClose()
                    } else setErr(r.msg)
                  }}
                >
                  <XCircle size={16} /> Cancelar reserva
                </Btn>
              </>
            )}
          </div>
        ) : st !== 'open' ? (
          <Alert kind="info">Aula encerrada ou em andamento — reservas fechadas.</Alert>
        ) : wpos >= 0 ? (
          <div className="space-y-2">
            <Alert kind="warn">
              <Hourglass size={12} className="mr-1 inline" /> Você é o <b>{wpos + 1}º</b> da lista de espera. Se alguém cancelar, você entra automaticamente e recebe aviso no WhatsApp.
            </Alert>
            <Btn variant="ghost" className="w-full" onClick={() => leaveWaitlist(slotId, ME_ID)}>
              Sair da lista de espera
            </Btn>
          </div>
        ) : check.code === 'window' ? (
          <Alert kind="info">
            <Lock size={12} className="mr-1 inline" />
            {check.msg}
          </Alert>
        ) : check.code === 'blocked' ? (
          <div className="space-y-2">
            <Alert kind="err">🔒 {check.msg}</Alert>
            <Btn
              className="w-full"
              onClick={() => {
                onClose()
                nav('planos')
              }}
            >
              Regularizar mensalidade
            </Btn>
          </div>
        ) : check.code === 'penalty' ? (
          <Alert kind="err">⚠️ {check.msg}</Alert>
        ) : check.code === 'full' ? (
          <Btn
            className="w-full"
            onClick={() => {
              const r = joinWaitlist(slotId, ME_ID)
              toast(r.ok ? `Você entrou na lista de espera (#${r.position})` : r.msg)
            }}
          >
            <Hourglass size={16} /> Entrar na lista de espera
          </Btn>
        ) : check.code === 'plan' && !salesStatus(db, slot).open ? (
          <div className="space-y-2">
            <Alert kind="warn">{check.msg}</Alert>
            <Alert kind="info">
              <Lock size={12} className="mr-1 inline" />
              Treino extra avulso indisponível neste horário: {salesStatus(db, slot).reason} Veja os horários sem a etiqueta “Venda bloqueada”.
            </Alert>
          </div>
        ) : check.code === 'plan' ? (
          <div className="space-y-2">
            <Alert kind="warn">{check.msg}</Alert>
            <Btn className="w-full" onClick={() => onExtra(slotId)}>
              <Zap size={16} /> Treino extra avulso • {brl(priceOf(db, 'extra'))}
            </Btn>
            <p className="text-center text-[10px] uppercase tracking-wider text-fg-subtle">Pix, cartão ou na recepção</p>
          </div>
        ) : (
          <div className="space-y-2">
            {db.settings.noShowRule.enabled && (
              <Alert kind="warn">
                ⏰ <b>Cancele até {fmtHours(db.settings.minCancelHours)} antes para evitar falta.</b> Faltas sem aviso este mês: {db.people[ME_ID].monthNoShows || 0}/{db.settings.noShowRule.tolerance}.
              </Alert>
            )}
            <Btn className="w-full py-3.5 text-base" onClick={doBook}>
              <Check size={18} /> Confirmar reserva
            </Btn>
          </div>
        )}
        <p className="text-center text-[11px] text-fg-subtle">Cancelamento e troca até {fmtHours(db.settings.minCancelHours)} antes do início.</p>
      </div>
    </Sheet>
  )
}

/* ---------------- Reserva recorrente ---------------- */
function RecurringSheet({ db, open, onClose }) {
  const current = db.recurrences.find((r) => r.personId === ME_ID)
  const [days, setDays] = useState(['seg', 'qua', 'sex'])
  const [time, setTime] = useState('06:00')
  const [result, setResult] = useState(null)
  useEffect(() => {
    setResult(null)
  }, [open])
  const wk = DAYS.filter((d) => d.key !== 'sab')
  const me = db.people[ME_ID]
  return (
    <Sheet open={open} onClose={onClose} title="Reserva fixa semanal">
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">Sua vaga é renovada automaticamente toda semana até você alterar. Sem precisar mandar mensagem toda semana. 🙌</p>
        {current && (
          <Alert kind="ok">
            Ativa: <b>{current.days.map((d) => dayByKey(d).short).join(' / ')}</b> às <b>{current.time}</b>{' '}
            <button className="ml-2 underline" onClick={() => removeRecurrence(ME_ID)}>
              desativar
            </button>
          </Alert>
        )}
        <Field label="Dias da semana">
          <div className="flex gap-1.5">
            {wk.map((d) => (
              <Chip key={d.key} active={days.includes(d.key)} onClick={() => setDays((x) => (x.includes(d.key) ? x.filter((y) => y !== d.key) : [...x, d.key]))}>
                {d.short}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Horário" hint={`Seu plano: ${PLANS[me.plan].label}. Dias além do limite não serão reservados.`}>
          <div className="grid grid-cols-4 gap-1.5">
            {WEEKDAY_TIMES.map((t) => (
              <Chip key={t} active={time === t} onClick={() => setTime(t)} className="py-2">
                {t}
              </Chip>
            ))}
          </div>
        </Field>
        {result && result.ok === false ? (
          <Alert kind="err">⚠️ {result.msg}</Alert>
        ) : result && (
          <Alert kind={result.failed.length ? 'warn' : 'ok'}>
            Reserva fixa ativada! {result.created.length ? `Nesta semana: ${result.created.map((s) => dayByKey(s.day).short).join(', ')} garantidos.` : 'Os dias escolhidos desta semana já passaram — começa na próxima semana.'}
            {result.failed.map((f) => (
              <div key={f.slot.id}>
                • {dayByKey(f.slot.day).short}: {f.msg}
              </div>
            ))}
          </Alert>
        )}
        <Btn className="w-full py-3" disabled={!days.length} onClick={() => setResult(setRecurrence(ME_ID, days, time))}>
          <Repeat size={16} /> Ativar {days.map((d) => dayByKey(d).short).join('/')} às {time}
        </Btn>
      </div>
    </Sheet>
  )
}

/* ---------------- Aula experimental ---------------- */
function TrialSheet({ db, open, onClose }) {
  const empty = { name: '', phone: '', slotId: '', withComp: false, companion: '', hasInjury: false, injuries: '', experience: 'Treina ocasionalmente', referrer: false }
  const [f, setF] = useState(empty)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setF(empty)
      setDone(null)
      setErr('')
    }
  }, [open])
  const opts = useMemo(
    () =>
      db.slots
        .filter((s) => TRIAL_LEVELS.includes(s.level) && slotStatus(db, s) === 'open')
        .map((s) => {
          const c = slotCounts(db, s.id)
          const sale = salesStatus(db, s)
          return { ...s, c, blocked: !sale.open || c.free === 0 || c.trials >= s.trialQuota, why: !sale.open ? '🔒 bloqueado p/ venda' : 'sem vaga exp.' }
        }),
    [db],
  )
  const up = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  const submit = () => {
    if (!f.name || !f.phone || !f.slotId) return setErr('Preencha nome, WhatsApp e horário.')
    const r = createTrial({
      name: f.name,
      phone: f.phone,
      slotId: f.slotId,
      companion: f.withComp ? f.companion || 'Acompanhante' : null,
      parq: { injuries: f.hasInjury ? f.injuries || 'Sim (não detalhado)' : 'Nenhuma', experience: f.experience },
      referrerId: f.referrer ? ME_ID : null,
    })
    if (!r.ok) return setErr(r.msg)
    setDone(r)
  }
  const slot = done && db.slots.find((s) => s.id === f.slotId)
  return (
    <Sheet open={open} onClose={onClose} title="Aula experimental" tall>
      {done ? (
        <div className="space-y-4 text-center">
          <div className="animate-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-3xl">🎉</div>
          <h4 className="font-display text-2xl font-bold uppercase">Aula agendada!</h4>
          <p className="text-sm text-fg-muted">
            {f.name}
            {f.withComp ? ` + ${f.companion || 'acompanhante'}` : ''} • {dayByKey(slot.day).label} às {slot.time} com {slot.coach}
          </p>
          <Alert kind="info">📲 Confirmação e lembrete enviados no WhatsApp {f.phone}. O coach já recebeu a ficha PAR-Q em destaque.</Alert>
          <Btn className="w-full" onClick={onClose}>
            Fechar
          </Btn>
        </div>
      ) : (
        <div className="space-y-3.5">
          <p className="text-sm text-fg-muted">Sem burocracia: 1 minuto e sua vaga está garantida. Horários de Iniciante ou Todos os Níveis.</p>
          <label className="flex items-center gap-2 rounded-xl bg-card p-3 text-xs ring-1 ring-line">
            <input type="checkbox" checked={f.referrer} onChange={up('referrer')} className="accent-accent" />
            Sou aluno(a) e estou indicando um amigo <span className="ml-auto">🤝</span>
          </label>
          <Field label="Nome completo">
            <input className={inputCls} value={f.name} onChange={up('name')} placeholder="Ex.: João Pereira" />
          </Field>
          <Field label="WhatsApp">
            <input className={inputCls} value={f.phone} onChange={up('phone')} placeholder="(11) 9 0000-0000" inputMode="tel" />
          </Field>
          <Field label="Horário" hint="Máx. de experimentais por turma definido pelo box, para garantir atenção técnica.">
            <select className={inputCls} value={f.slotId} onChange={up('slotId')}>
              <option value="">Selecione…</option>
              {opts.map((s) => (
                <option key={s.id} value={s.id} disabled={s.blocked}>
                  {dayByKey(s.day).short} {s.time} • {LEVELS[s.level].short} • {s.blocked ? s.why : `${s.trialQuota - s.c.trials} vaga(s) exp.`}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.withComp} onChange={up('withComp')} className="accent-accent" />
            Vou com meu esposo(a) / acompanhante
          </label>
          {f.withComp && <input className={inputCls} value={f.companion} onChange={up('companion')} placeholder="Nome do acompanhante" />}

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">🩺 Mini ficha PAR-Q</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.hasInjury} onChange={up('hasInjury')} className="accent-accent" />
              Tenho lesão, dor ou restrição médica
            </label>
            {f.hasInjury && <textarea className={`${inputCls} mt-2`} rows={2} value={f.injuries} onChange={up('injuries')} placeholder="Ex.: dor no joelho direito, cirurgia no ombro em 2023…" />}
            <div className="mt-2">
              <Field label="Experiência física">
                <select className={inputCls} value={f.experience} onChange={up('experience')}>
                  <option>Sedentário(a)</option>
                  <option>Treina ocasionalmente</option>
                  <option>Treina regularmente</option>
                  <option>Já praticou CrossFit</option>
                </select>
              </Field>
            </div>
          </div>
          {err && <Alert kind="err">{err}</Alert>}
          <Btn className="w-full py-3" onClick={submit}>
            Agendar aula grátis
          </Btn>
        </div>
      )}
    </Sheet>
  )
}

/* ---------------- Drop-in ---------------- */
function DropinSheet({ db, open, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', fromBox: '', experience: '1–3 anos', slotId: '' })
  const [pay, setPay] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setPay(false)
      setErr('')
    }
  }, [open])
  const opts = db.slots.filter((s) => slotStatus(db, s) === 'open')
  const up = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  if (pay)
    return (
      <Checkout
        db={db}
        open={open}
        onClose={onClose}
        kind="dropin"
        slotId={f.slotId}
        title="Pagamento do drop-in"
        start={(method) => createDropin({ ...f, method })}
        intro={
          <p className="text-sm text-fg-muted">
            {f.name.split(' ')[0]}, sua aula: <b className="text-fg">{(() => {
              const s = db.slots.find((x) => x.id === f.slotId)
              return s ? `${dayByKey(s.day).label} ${s.time}` : ''
            })()}</b>
          </p>
        }
      />
    )
  return (
    <Sheet open={open} onClose={onClose} title="Drop-in / Convidado">
      <div className="space-y-3.5">
        <p className="text-sm text-fg-muted">Pratica CrossFit em outra cidade? Reserve uma aula avulsa no {BOX.name}.</p>
        <Field label="Nome">
          <input className={inputCls} value={f.name} onChange={up('name')} />
        </Field>
        <Field label="WhatsApp">
          <input className={inputCls} value={f.phone} onChange={up('phone')} inputMode="tel" />
        </Field>
        <Field label="Box / cidade de origem">
          <input className={inputCls} value={f.fromBox} onChange={up('fromBox')} placeholder="Ex.: Box Alpha — Curitiba" />
        </Field>
        <Field label="Tempo de experiência">
          <select className={inputCls} value={f.experience} onChange={up('experience')}>
            <option>menos de 1 ano</option>
            <option>1–3 anos</option>
            <option>mais de 3 anos</option>
          </select>
        </Field>
        <Field label="Horário">
          <select className={inputCls} value={f.slotId} onChange={up('slotId')}>
            <option value="">Selecione…</option>
            {opts.map((s) => {
              const free = slotCounts(db, s.id).free
              const sale = salesStatus(db, s)
              return (
                <option key={s.id} value={s.id} disabled={!sale.open || !free}>
                  {dayByKey(s.day).short} {s.time} • {LEVELS[s.level].short} • {!sale.open ? '🔒 bloqueado p/ venda' : !free ? 'lotado' : `${free} vagas`}
                </option>
              )
            })}
          </select>
        </Field>
        {err && <Alert kind="err">{err}</Alert>}
        <Btn
          className="w-full py-3"
          onClick={() => {
            if (!f.name || !f.slotId) return setErr('Informe nome e horário.')
            setErr('')
            setPay(true)
          }}
        >
          Continuar para pagamento • {brl(priceOf(db, 'dropin'))}
        </Btn>
      </div>
    </Sheet>
  )
}

/* ---------------- Check-in rápido: GPS real, QR e simulação (demo) ---------------- */
function GpsCheckinRow({ db, booking, onQR }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => setErr(''), [booking.id, db.settings.gpsEnabled, db.settings.gpsRadiusM])
  const enabled = gpsEnabled(db)
  const done = (r) => {
    setBusy(false)
    if (r.ok) toast('📍 Presença confirmada por GPS!')
    else setErr(r.msg)
  }
  const real = async () => {
    setErr('')
    setBusy(true)
    done(await checkinRealGPS(booking.id))
  }
  const sim = () => {
    setErr('')
    done(checkinSimulatedGPS(booking.id))
  }
  if (!enabled) {
    return <div className="mt-2 text-[10px] font-semibold opacity-75">📍 Check-in por GPS desativado pelo box • confirme pelo QR Code do coach</div>
  }
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={real}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-ink/15 py-2 text-xs font-bold ring-1 ring-ink/20 active:scale-[.98] disabled:opacity-60"
        >
          {busy ? 'Localizando…' : '📍 Cheguei no Box (GPS)'}
        </button>
        <button onClick={onQR} className="flex items-center justify-center gap-1.5 rounded-xl bg-ink/15 py-2 text-xs font-bold ring-1 ring-ink/20 active:scale-[.98]">
          <ScanLine size={13} /> Ler QR Code
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-semibold opacity-75">
        <span>📍 Confirmação por localização • até {gpsRadius(db)} m do box</span>
        <button onClick={sim} className="underline opacity-80" title="Para demonstrações remotas: coloca você dentro do raio do box">
          Simular GPS no Box
        </button>
      </div>
      {err && <div className="mt-2 rounded-lg bg-ink/15 px-2.5 py-1.5 text-[11px] font-semibold">{err}</div>}
    </>
  )
}

/* ---------------- Leitor de QR ---------------- */
function ScanSheet({ db, open, onClose }) {
  const [res, setRes] = useState(null)
  useEffect(() => {
    setRes(null)
  }, [open])
  const qrSlot = db.qr && db.slots.find((s) => s.id === db.qr.slotId)
  return (
    <Sheet open={open} onClose={onClose} title="Check-in por QR Code">
      <div className="space-y-4">
        <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-3xl bg-gradient-to-br from-elevated to-surface">
          <div className="absolute inset-6 rounded-2xl border-2 border-dashed border-white/20" />
          {['left-4 top-4 border-l-4 border-t-4', 'right-4 top-4 border-r-4 border-t-4', 'bottom-4 left-4 border-b-4 border-l-4', 'bottom-4 right-4 border-b-4 border-r-4'].map((c) => (
            <div key={c} className={`absolute h-10 w-10 rounded-md border-accent ${c}`} />
          ))}
          {qrSlot ? (
            <div className="absolute inset-12 flex items-center justify-center rounded-xl bg-white p-2 opacity-80">
              <QRCodeSVG value={`dsagende://checkin/${db.qr.slotId}/${db.qr.token}`} size={140} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-xs text-fg-subtle">
              <QrCode size={28} className="mb-2" />
            </div>
          )}
          <div className="animate-scanline absolute inset-x-6 h-0.5 bg-accent shadow-[0_0_12px_#bf9055]" />
        </div>
        {qrSlot ? (
          <p className="text-center text-xs text-fg-muted">
            Câmera apontada para a tela do coach • Turma <b className="text-fg">{dayByKey(qrSlot.day).short} {qrSlot.time}</b>
          </p>
        ) : (
          <Alert kind="warn">Nenhum QR ativo. Abra <b>Painel Coach → Turmas</b> e toque em “Exibir QR da turma”.</Alert>
        )}
        {res && <Alert kind={res.ok ? 'ok' : 'err'}>{res.ok ? '✅ Presença confirmada!' : res.msg}</Alert>}
        <Btn
          className="w-full py-3"
          onClick={() => {
            const r = scanQR()
            setRes(r)
            if (r.ok) setTimeout(onClose, 500)
          }}
        >
          <ScanLine size={18} /> Simular leitura do QR
        </Btn>
      </div>
    </Sheet>
  )
}

/* ---------------- "Estou aqui": check-in por localização ---------------- */
function LocationSheet({ db, booking, open, onClose, onQR }) {
  const [res, setRes] = useState(null)
  const [locating, setLocating] = useState(false)
  useEffect(() => {
    setRes(null)
  }, [open])
  if (!open || !booking) return null
  const g = gpsCheck(db, booking)
  const ok = g.inRadius && g.inWindow
  const useReal = () => {
    if (!navigator.geolocation) return setRes({ ok: false, msg: 'Este aparelho não oferece geolocalização.' })
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        setRealGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) })
      },
      () => {
        setLocating(false)
        setRes({ ok: false, msg: 'Permissão de localização negada. Use o QR Code com o coach.' })
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }
  return (
    <Sheet open onClose={onClose} title="Estou aqui" tall>
      <div className="space-y-4">
        <BoxMap dist={g.dist} radius={g.radius} />
        <div className="text-center">
          <div className={`font-display text-4xl font-extrabold ${g.inRadius ? 'text-highlight' : 'text-rose-400'}`}>{fmtDist(g.dist)}</div>
          <div className="text-xs text-fg-muted">
            de distância do {BOX.name}
            {db.realGps ? ` • GPS real (±${db.realGps.accuracy} m)` : ' • localização simulada'}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-subtle">{BOX.address}</div>
        </div>
        <div className="space-y-1.5">
          <CheckRow ok={g.inRadius} label={g.inRadius ? `Dentro do raio de ${g.radius} m do box` : `Fora do raio de ${g.radius} m — aproxime-se do box`} />
          <CheckRow
            ok={g.inWindow}
            label={
              g.inWindow
                ? `Janela da aula aberta (${dayByKey(booking.slot.day).short} ${booking.slot.time})`
                : g.late
                  ? 'Janela de check-in encerrada'
                  : `Check-in libera em ${g.minutesToOpen} min (${BOX.checkinWindowMin} min antes da aula)`
            }
          />
        </div>
        {res && <Alert kind={res.ok ? 'ok' : 'err'}>{res.ok ? '✅ Presença confirmada pela sua localização!' : res.msg}</Alert>}
        <Btn
          className="w-full py-3.5 text-base"
          disabled={!ok}
          onClick={() => {
            const r = checkinGPS(booking.id)
            setRes(r)
            if (r.ok) setTimeout(onClose, 600)
          }}
        >
          <MapPin size={18} /> Confirmar presença
        </Btn>
        <div className="flex items-center justify-between text-xs">
          <button onClick={useReal} className="flex items-center gap-1 text-fg-muted underline" disabled={locating}>
            {locating ? 'Localizando…' : db.realGps ? 'Atualizar GPS real' : 'Usar GPS real do aparelho'}
          </button>
          <button onClick={onQR} className="flex items-center gap-1 text-fg-muted underline">
            <ScanLine size={12} /> Prefiro QR Code
          </button>
        </div>
        <p className="text-center text-[10px] text-fg-subtle">A localização é usada só no momento do check-in e não fica guardada.</p>
      </div>
    </Sheet>
  )
}

function CheckRow({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ring-1 ${ok ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30' : 'bg-card text-fg-muted ring-line'}`}>
      {ok ? <Check size={15} className="text-emerald-400" /> : <XCircle size={15} className="text-fg-subtle" />}
      {label}
    </div>
  )
}

// Mapa estilizado: box no centro, círculo do raio configurado e a posição do aluno
function BoxMap({ dist, radius = BOX.gpsRadiusM }) {
  const R = 62 // px que representam o raio configurado
  const far = dist > radius * 2.4
  const r = far ? 128 : (dist / radius) * R
  const ang = -0.75
  const ux = 160 + Math.cos(ang) * Math.min(r, 128)
  const uy = 105 + Math.sin(ang) * Math.min(r, 128) * 0.75
  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-line">
      <svg viewBox="0 0 320 210" className="block w-full bg-elevated">
        {[30, 85, 140, 195].map((y) => (
          <rect key={y} x="0" y={y - 6} width="320" height="12" className="fill-line" />
        ))}
        {[40, 120, 205, 285].map((x) => (
          <rect key={x} x={x - 6} y="0" width="12" height="210" className="fill-line" />
        ))}
        <rect x="140" y="92" width="58" height="40" rx="4" className="fill-line-strong" />
        <circle cx="160" cy="105" r={R} className="fill-accent/10 stroke-accent" strokeDasharray="4 4" strokeWidth="1.5" />
        <text x="160" y={105 - R - 5} textAnchor="middle" fontSize="9" className="fill-highlight">
          raio {radius} m
        </text>
        <g>
          <circle cx="160" cy="105" r="13" className="fill-accent" />
          <text x="160" y="109" textAnchor="middle" fontSize="10" fontWeight="800" className="fill-ink">
            DS
          </text>
        </g>
        {!far && <line x1="160" y1="105" x2={ux} y2={uy} className="stroke-fg-subtle" strokeDasharray="2 3" />}
        <circle cx={ux} cy={uy} r="14" fill={far ? 'rgba(244,63,94,.2)' : 'rgba(56,189,248,.25)'}>
          <animate attributeName="r" values="8;16;8" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle cx={ux} cy={uy} r="6" fill={far ? '#fb7185' : '#38bdf8'} stroke="#fff" strokeWidth="2" />
        <text x={ux} y={uy + 22} textAnchor="middle" fontSize="9" fontWeight="700" className="fill-fg">
          Você{far ? ` • ${fmtDist(dist)} →` : ''}
        </text>
      </svg>
    </div>
  )
}
