/*
 * Checkout único: mensalidade/pacote, drop-in e treino extra.
 * Pix e Cartão simulam o gateway (em produção: Edge Function `create_charge` + webhook `confirm_payment`).
 * "Na recepção" gera a cobrança pendente para baixa manual do gestor (Dinheiro / Maquininha).
 */
import { useEffect, useState } from 'react'
import { CreditCard, Loader2, QrCode, Store, Timer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { HOLD_MINUTES, ME_ID, PAY_METHODS, PLANS, brl } from '../lib/constants'
import { KIND_LABEL, confirmPayment, expireHold, monthlyDue, priceOf, startCheckout, toast } from '../lib/store'
import { Alert, Btn, Sheet } from './ui'

function useTick(on) {
  const [, setT] = useState(0)
  useEffect(() => {
    if (!on) return
    const i = setInterval(() => setT((x) => x + 1), 1000)
    return () => clearInterval(i)
  }, [on])
}

const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function MethodButton({ icon: Icon, title, sub, onClick, disabled }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-card p-3.5 text-left ring-1 ring-line transition hover:ring-accent/50 active:scale-[.99] disabled:opacity-40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-highlight">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[11px] text-fg-subtle">{sub}</span>
      </span>
    </button>
  )
}

/**
 * props:
 *  kind: 'mensalidade' | 'dropin' | 'extra'
 *  plan: plano (mensalidade)
 *  slotId: aula (drop-in / extra) → Pix/Cartão pré-reserva 15 min
 *  start(method): opcional, substitui startCheckout (ex.: drop-in precisa criar o visitante antes)
 *  validate(): opcional, retorna mensagem de erro antes de escolher o método
 */
export default function Checkout({ db, open, onClose, kind, plan, slotId, personId = ME_ID, start, validate, title, intro }) {
  const [payId, setPayId] = useState(null)
  const [view, setView] = useState('choose') // choose | pix | cartao | recepcao
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setPayId(null)
      setView('choose')
      setErr('')
      setBusy(false)
    }
  }, [open, kind, plan, slotId])

  const pay = payId && db.payments.find((x) => x.id === payId)
  const booking = pay?.bookingId && db.bookings.find((b) => b.id === pay.bookingId)
  const holding = booking?.status === 'pre_reserva'
  useTick(open && holding)
  if (!open) return null

  const due = kind === 'mensalidade' ? monthlyDue(db, personId, plan) : null
  const amount = pay?.amount ?? (due ? due.total : priceOf(db, kind, plan))
  const discount = pay ? pay.discount || 0 : due?.discount || 0
  const label = `${KIND_LABEL[kind]}${kind === 'mensalidade' && plan ? ` • ${PLANS[plan].label}` : ''}`

  const choose = (method) => {
    setErr('')
    const v = validate?.()
    if (v) return setErr(v)
    const r = start ? start(method) : startCheckout({ kind, personId, plan, slotId, method })
    if (!r.ok) return setErr(r.msg)
    setPayId(r.payment.id)
    setView(method)
  }

  const confirm = () => {
    const r = confirmPayment(payId)
    if (!r.ok) setErr(r.msg)
  }

  const pixCode = `00020126580014BR.GOV.BCB.PIX0136dsagende-${kind}-${payId || 'x'}5204000053039865406${amount.toFixed(2)}5802BR5911ICARA CROSS6009SAO PAULO`

  let body
  if (pay?.status === 'pago') {
    body = (
      <div className="space-y-4 text-center">
        <div className="animate-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl text-white">✓</div>
        <h4 className="font-display text-2xl font-bold uppercase">Pagamento confirmado</h4>
        <p className="text-sm text-fg-muted">
          {label}: <b className="text-fg">{brl(pay.amount)}</b> via {PAY_METHODS[pay.method].label}.
        </p>
        {booking && <Alert kind="ok">Vaga confirmada na aula. Ela já aparece na grade e no WhatsApp.</Alert>}
        {kind === 'mensalidade' && <Alert kind="ok">Mensalidade renovada. Se o acesso estava bloqueado, a reserva fixa voltou sozinha.</Alert>}
        <Btn className="w-full" onClick={onClose}>
          Fechar
        </Btn>
      </div>
    )
  } else if (pay?.status === 'expirado') {
    body = (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-3xl">⌛</div>
        <h4 className="font-display text-2xl font-bold uppercase">Pré-reserva expirada</h4>
        <p className="text-sm text-fg-muted">O pagamento não foi confirmado em {HOLD_MINUTES} minutos. A vaga voltou para a grade e, se houver lista de espera, o próximo já foi chamado.</p>
        <Btn className="w-full" onClick={onClose}>
          Fechar
        </Btn>
      </div>
    )
  } else if (view === 'choose') {
    body = (
      <div className="space-y-3">
        {intro}
        <div className="rounded-2xl bg-inverse p-4 text-on-inverse">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</div>
          <div className="font-display text-4xl font-extrabold">{brl(amount)}</div>
          {discount > 0 && (
            <div className="mt-1 text-[11px] opacity-80">
              <s>{brl(amount + discount)}</s> • 🎁 −{brl(discount)} do Indique e Ganhe
            </div>
          )}
        </div>
        {slotId && (
          <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <Timer size={12} /> Pix e Cartão seguram a vaga por {HOLD_MINUTES} min até a confirmação do pagamento.
          </p>
        )}
        <MethodButton icon={QrCode} title="Pix" sub="QR Code ou copia e cola • confirmação na hora" onClick={() => choose('pix')} />
        <MethodButton icon={CreditCard} title="Cartão de crédito" sub="Pagamento online seguro" onClick={() => choose('cartao')} />
        <MethodButton icon={Store} title="Pagar na recepção" sub="Dinheiro ou maquininha • o gestor dá baixa no painel" onClick={() => choose('recepcao')} />
        {err && <Alert kind="err">{err}</Alert>}
      </div>
    )
  } else if (view === 'pix') {
    body = (
      <div className="space-y-4 text-center">
        {holding && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 ring-1 ring-amber-500/30">
            <Timer size={14} /> Vaga pré-reservada • expira em {fmtLeft(booking.holdUntil - Date.now())}
          </div>
        )}
        <div className="mx-auto w-fit rounded-2xl bg-white p-3">
          <QRCodeSVG value={pixCode} size={160} />
        </div>
        <div className="font-display text-3xl font-bold">{brl(amount)}</div>
        <button
          className="w-full truncate rounded-xl bg-card px-3 py-2 font-mono text-[10px] text-fg-muted ring-1 ring-line"
          onClick={() => {
            navigator.clipboard?.writeText(pixCode).catch(() => {})
            toast('Código Pix copiado!')
          }}
        >
          {pixCode}
        </button>
        {err && <Alert kind="err">{err}</Alert>}
        <Btn className="w-full" onClick={confirm}>
          Simular Pix pago (webhook do gateway)
        </Btn>
        {holding && (
          <Btn variant="ghost" className="w-full text-xs" onClick={() => expireHold(booking.id)}>
            ⏩ Simular {HOLD_MINUTES} min sem pagar
          </Btn>
        )}
      </div>
    )
  } else if (view === 'cartao') {
    body = (
      <div className="space-y-3">
        {holding && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 ring-1 ring-amber-500/30">
            <Timer size={14} /> Vaga pré-reservada • expira em {fmtLeft(booking.holdUntil - Date.now())}
          </div>
        )}
        <div className="rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 text-white shadow-xl">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest opacity-70">
            <span>Cartão de teste</span>
            <CreditCard size={16} />
          </div>
          <div className="mt-6 font-mono text-lg tracking-widest">•••• •••• •••• 4242</div>
          <div className="mt-2 flex justify-between text-[11px] opacity-80">
            <span>{db.people[pay?.personId || personId]?.name.toUpperCase()}</span>
            <span>12/30</span>
          </div>
        </div>
        <p className="text-[11px] text-fg-subtle">Na demonstração o cartão é fictício. Em produção, os dados vão direto para o checkout seguro do gateway: o DS Agende nunca guarda o número do cartão.</p>
        {err && <Alert kind="err">{err}</Alert>}
        <Btn
          className="w-full py-3"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setTimeout(() => {
              setBusy(false)
              confirm()
            }, 1200)
          }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} {busy ? 'Processando…' : `Pagar ${brl(amount)}`}
        </Btn>
        {holding && (
          <Btn variant="ghost" className="w-full text-xs" onClick={() => expireHold(booking.id)}>
            ⏩ Simular {HOLD_MINUTES} min sem pagar
          </Btn>
        )}
      </div>
    )
  } else {
    body = (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-3xl">🏪</div>
        <h4 className="font-display text-2xl font-bold uppercase">Pague na recepção</h4>
        <p className="text-sm text-fg-muted">
          {label}: <b className="text-fg">{brl(amount)}</b> em dinheiro ou na maquininha.
        </p>
        {booking ? <Alert kind="ok">Vaga confirmada. O coach vê na chamada que o pagamento será feito no balcão.</Alert> : <Alert kind="info">A cobrança ficou pendente. Quando você pagar, o gestor dá baixa em Coach/Gestão → Financeiro.</Alert>}
        <Btn className="w-full" onClick={onClose}>
          Entendi
        </Btn>
      </div>
    )
  }

  return (
    <Sheet open onClose={onClose} title={title || 'Pagamento'} tall>
      {body}
    </Sheet>
  )
}
