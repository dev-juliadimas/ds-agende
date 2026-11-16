import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, MessageCircle, QrCode, Repeat, StopCircle, UserMinus, X, Globe2, GraduationCap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { DAYS, LEVELS, dayByKey } from '../../lib/constants'
import { billingStatus, cancel, checkin, clearQR, closeClass, convertTrial, isBirthday, rotateQR, slotCounts, slotStatus, toast, undoCheckin } from '../../lib/store'
import { Alert, Btn, CapacityBar, LevelTag } from '../../components/ui'

export default function Turmas({ db }) {
  const [day, setDay] = useState(db.now.day)
  const daySlots = db.slots.filter((s) => s.day === day)
  const defaultSlot = daySlots.find((s) => ['open', 'live'].includes(slotStatus(db, s)))?.id || daySlots[0].id
  const [slotId, setSlotId] = useState(defaultSlot)
  const [showQR, setShowQR] = useState(false)
  useEffect(() => {
    if (!daySlots.some((s) => s.id === slotId)) setSlotId(defaultSlot)
  }, [day])

  const slot = db.slots.find((s) => s.id === slotId)
  const c = slotCounts(db, slotId)
  const roster = db.bookings.filter((b) => b.slotId === slotId && b.status !== 'swapping').map((b) => ({ ...b, p: db.people[b.personId] }))
  const activeR = roster.filter((b) => ['reservado', 'presente', 'falta', 'pre_reserva'].includes(b.status))
  const cancelled = roster.filter((b) => b.status === 'cancelado')
  const alerts = activeR.filter((b) => b.type === 'experimental' || b.type === 'dropin')
  const wl = (db.waitlist[slotId] || []).map((id) => db.people[id])
  const st = slotStatus(db, slot)
  const presentN = activeR.filter((b) => b.status === 'presente').length
  const qrActive = db.qr?.slotId === slotId
  // Aniversariante do dia: faz aniversário na data da aula e está com a reserva confirmada (reservado ou presente)
  const classDate = dayByKey(slot.day).date
  const bdayIn = (sid) => db.bookings.some((b) => b.slotId === sid && ['reservado', 'presente'].includes(b.status) && isBirthday(db.people[b.personId], dayByKey(db.slots.find((x) => x.id === sid).day).date))
  const birthdays = activeR.filter((b) => b.status !== 'falta' && isBirthday(b.p, classDate))

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {DAYS.map((d) => (
          <button key={d.key} onClick={() => setDay(d.key)} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${day === d.key ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line'}`}>
            {d.short}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {daySlots.map((s) => {
          const k = slotCounts(db, s.id)
          const sst = slotStatus(db, s)
          return (
            <button
              key={s.id}
              onClick={() => setSlotId(s.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-left ring-1 ${slotId === s.id ? 'bg-accent text-ink ring-accent' : 'bg-card ring-line'} ${sst === 'closed' || sst === 'past' ? 'opacity-50' : ''}`}
            >
              <div className="font-display text-lg font-bold leading-none">
                {s.time}
                {bdayIn(s.id) && <span className="ml-1 text-sm" role="img" aria-label="tem aniversariante">🎂</span>}
              </div>
              <div className="text-[10px] font-semibold opacity-70">
                {k.taken}/{k.cap}
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-2xl font-extrabold">
              {dayByKey(slot.day).label} • {slot.time}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <LevelTag level={slot.level} size="xs" />
              <span className="text-xs text-fg-muted">{slot.coach}</span>
            </div>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${st === 'live' ? 'bg-amber-500/20 text-amber-300' : st === 'closed' ? 'bg-elevated text-fg-muted' : st === 'past' ? 'bg-elevated text-fg-subtle' : 'bg-emerald-500/15 text-emerald-300'}`}
          >
            {{ live: 'Em andamento', closed: 'Encerrada', past: 'Passada', open: 'Aberta' }[st]}
          </span>
        </div>
        <div className="mt-3">
          <CapacityBar taken={c.taken} cap={c.cap} trials={c.trials} quota={slot.trialQuota} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn
            disabled={st === 'closed' || st === 'past'}
            onClick={() => {
              rotateQR(slotId)
              setShowQR(true)
            }}
          >
            <QrCode size={16} /> {qrActive ? 'Ver QR ativo' : 'Exibir QR da turma'}
          </Btn>
          <Btn
            variant="dark"
            disabled={st === 'closed' || st === 'past'}
            onClick={() => {
              const r = closeClass(slotId)
              toast(`Aula encerrada: ${r.present} presentes • ${r.noshow} faltas • ${r.cancelled} cancelados`)
            }}
          >
            <StopCircle size={16} /> Encerrar aula
          </Btn>
        </div>
        {qrActive && <p className="mt-2 text-center text-[11px] font-semibold text-highlight">● QR dinâmico ativo — renova a cada 30 s</p>}
      </div>

      {birthdays.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-accent/15 p-3 ring-1 ring-accent/50">
          <span className="text-3xl" aria-hidden>🎂</span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-highlight">Aniversariante do dia</div>
            <div className="font-display text-lg leading-tight">{birthdays.map((b) => b.p.name).join(' • ')}</div>
            <div className="text-[11px] text-fg-muted">Confirmado(a) nesta turma — que tal puxar o parabéns no final do WOD?</div>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
            <AlertTriangle size={14} /> Atenção do coach — {alerts.length} visitante(s)
          </div>
          <div className="space-y-2">
            {alerts.map((b) => (
              <div key={b.id} className="rounded-xl bg-surface/60 p-2.5 text-xs">
                <div className="flex items-center gap-2 font-semibold text-fg">
                  {b.p.name}
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${b.type === 'dropin' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{b.type === 'dropin' ? 'Drop-in' : 'Experimental'}</span>
                  {b.p.companionOf && <span className="text-[10px] text-fg-muted">acompanhante de {db.people[b.p.companionOf]?.name.split(' ')[0]}</span>}
                </div>
                {b.p.parq && (
                  <div className="mt-1 space-y-0.5 text-fg-soft">
                    <div>
                      🩺 <b>Lesões:</b> <span className={b.p.parq.injuries !== 'Nenhuma' ? 'text-amber-200' : ''}>{b.p.parq.injuries}</span>
                    </div>
                    <div>
                      🏃 <b>Experiência:</b> {b.p.parq.experience}
                    </div>
                  </div>
                )}
                {b.p.referrerId && db.people[b.p.referrerId]?.role === 'aluno' && <div className="mt-1 text-[10px] text-highlight">🤝 Indicação de {db.people[b.p.referrerId].name}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">Lista de chamada</h3>
          <span className="text-xs text-fg-subtle">
            {presentN}/{activeR.length} presentes
          </span>
        </div>
        <div className="space-y-1.5">
          {activeR.map((b) => (
            <div key={b.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ${b.status === 'presente' ? 'bg-emerald-500/10 ring-emerald-500/30' : b.status === 'falta' ? 'bg-rose-500/10 ring-rose-500/30' : 'bg-card/60 ring-line'}`}>
              <button
                disabled={st === 'closed'}
                onClick={() => (b.status === 'presente' ? undoCheckin(b.id) : checkin(b.id, 'manual'))}
                className="shrink-0"
                aria-label="Alternar presença"
                title="Confirmar presença manualmente"
              >
                {b.status === 'presente' ? <CheckCircle2 size={22} className="text-emerald-400" /> : b.status === 'falta' ? <X size={22} className="text-rose-400" /> : <Circle size={22} className="text-fg-subtle" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {b.p.name}
                  {b.personId === 'me' && <span className="text-[10px] text-highlight">(demo)</span>}
                  {b.status !== 'falta' && isBirthday(b.p, classDate) && (
                    <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase text-on-accent">🎂 Aniversariante do dia</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
                  {b.type === 'recorrente' && (
                    <span className="flex items-center gap-0.5">
                      <Repeat size={10} /> fixo
                    </span>
                  )}
                  {b.type === 'experimental' && <span className="text-emerald-300">experimental</span>}
                  {b.type === 'dropin' && (
                    <span className="flex items-center gap-0.5 text-sky-300">
                      <Globe2 size={10} /> drop-in
                    </span>
                  )}
                  {b.source === 'whatsapp' && (
                    <span className="flex items-center gap-0.5 text-emerald-700 dark:text-wa-light">
                      <MessageCircle size={10} /> WhatsApp
                    </span>
                  )}
                  {b.confirmed && <span className="text-highlight">confirmou no lembrete</span>}
                  {b.checkin && <span>✓ {b.checkin.method === 'qr' ? 'QR' : b.checkin.method === 'gps' ? 'GPS' : 'manual'} {b.checkin.at}</span>}
                  {b.status === 'falta' && <span className="text-rose-300">falta sem aviso</span>}
                  {b.status === 'pre_reserva' && <span className="font-bold text-amber-600 dark:text-amber-300">⏳ aguardando pagamento</span>}
                  {b.payPending && <span className="font-bold text-amber-600 dark:text-amber-300">💰 paga na recepção</span>}
                  {billingStatus(db, b.personId).status === 'carencia' && <span className="text-amber-600 dark:text-amber-300">mensalidade em carência</span>}
                </div>
              </div>
              {b.type === 'experimental' && b.status === 'presente' && b.p.role === 'visitante' && (
                <button onClick={() => convertTrial(b.personId)} className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[10px] font-bold text-ink">
                  <GraduationCap size={12} /> Matricular
                </button>
              )}
              {b.p.converted && <span className="text-[10px] font-bold text-highlight">MATRICULADO</span>}
              {b.status === 'reservado' && st !== 'closed' && (
                <button
                  onClick={() => {
                    cancel(b.id, 'coach', { force: true, reason: 'coach' })
                    toast(`Vaga de ${b.p.name.split(' ')[0]} liberada`)
                  }}
                  className="rounded-lg p-1 text-fg-subtle hover:bg-elevated hover:text-rose-300"
                  title="Liberar vaga (aluno avisou)"
                >
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
          {!activeR.length && <p className="py-4 text-center text-xs text-fg-subtle">Nenhum inscrito.</p>}
        </div>
      </div>

      {wl.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-muted">Lista de espera</h3>
          {wl.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-card/60 px-3 py-2 text-sm ring-1 ring-line">
              <span className="font-display font-bold text-amber-300">#{i + 1}</span> {p.name}
            </div>
          ))}
          <p className="mt-1 text-[11px] text-fg-subtle">Ao liberar uma vaga (ícone ➖), o 1º da fila entra automaticamente e recebe aviso no WhatsApp.</p>
        </div>
      )}

      {cancelled.length > 0 && (
        <p className="text-[11px] text-fg-subtle">
          Cancelados no prazo: {cancelled.map((b) => b.p.name.split(' ')[0]).join(', ')}
        </p>
      )}

      {st === 'closed' && <Alert kind="info">Aula encerrada. Reservas cruzadas com check-ins e enviadas ao dashboard de métricas.</Alert>}

      {showQR && <QROverlay db={db} slot={slot} onClose={() => setShowQR(false)} onStop={() => (clearQR(), setShowQR(false))} />}
    </div>
  )
}

function QROverlay({ db, slot, onClose, onStop }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(i)
  }, [])
  if (!db.qr) return null
  const left = Math.max(0, db.qr.ttl - Math.floor((Date.now() - db.qr.issuedAt) / 1000))
  const present = db.bookings.filter((b) => b.slotId === slot.id && b.status === 'presente').length
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-canvas p-6 text-center">
      <button onClick={onClose} className="absolute right-4 top-14 rounded-full bg-card p-2" aria-label="Fechar">
        <X size={18} />
      </button>
      <div className="text-[10px] font-bold uppercase tracking-[.3em] text-highlight">Check-in da turma</div>
      <div className="font-display text-4xl font-extrabold uppercase">
        {dayByKey(slot.day).short} {slot.time}
      </div>
      <div className="mt-1 text-xs text-fg-muted">
        {LEVELS[slot.level].label} • {slot.coach}
      </div>
      <div className="mt-6 rounded-3xl bg-white p-4 shadow-[0_0_60px_rgba(191,144,85,.3)]">
        <QRCodeSVG value={`dsagende://checkin/${slot.id}/${db.qr.token}`} size={200} level="M" />
      </div>
      <div className="mt-4 font-mono text-sm tracking-[.4em] text-fg-muted">{db.qr.token}</div>
      <div className="mt-3 h-1 w-48 overflow-hidden rounded-full bg-elevated">
        <div className="h-full bg-accent transition-all duration-1000" style={{ width: `${(left / db.qr.ttl) * 100}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-fg-subtle">Novo código em {left}s • válido só durante esta aula</div>
      <div className="mt-6 font-display text-5xl font-extrabold text-highlight">{present}</div>
      <div className="text-xs uppercase tracking-widest text-fg-muted">presenças confirmadas</div>
      <p className="mt-4 max-w-[260px] text-[11px] text-fg-subtle">Demo: feche esta tela e vá em Agenda → “Escanear QR” para simular o aluno lendo o código.</p>
      <Btn variant="ghost" className="mt-2 text-xs" onClick={onStop}>
        Desativar QR
      </Btn>
    </div>
  )
}
