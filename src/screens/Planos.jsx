import { useState } from 'react'
import { CalendarCheck, Check, Globe2, Lock, Receipt, Zap } from 'lucide-react'
import { ME_ID, PAY_METHODS, PLANS, brl, fmtDate } from '../lib/constants'
import { BILLING_LABEL, KIND_LABEL, billingStatus, demoSetBilling, monthlyDue, priceOf } from '../lib/store'
import Checkout from '../components/Checkout'
import { Alert, Btn } from '../components/ui'

const STATUS_STYLE = {
  pago: { box: 'bg-emerald-500/10 ring-emerald-500/30', tag: 'bg-emerald-500 text-white', emoji: '✅' },
  carencia: { box: 'bg-amber-500/10 ring-amber-500/30', tag: 'bg-amber-400 text-ink', emoji: '⏳' },
  bloqueado: { box: 'bg-rose-500/10 ring-rose-500/40', tag: 'bg-rose-500 text-white', emoji: '🔒' },
}
const PAY_STATUS = {
  pago: 'text-emerald-600 dark:text-emerald-300',
  pendente: 'text-amber-600 dark:text-amber-300',
  expirado: 'text-fg-subtle line-through',
  cancelado: 'text-fg-subtle line-through',
}

export default function Planos({ db, nav = () => {} }) {
  const me = db.people[ME_ID]
  const bs = billingStatus(db, ME_ID)
  const st = STATUS_STYLE[bs.status]
  const [checkout, setCheckout] = useState(null) // { plan }
  const g = db.settings.graceDays
  const pendingDesk = db.payments.find((x) => x.personId === ME_ID && x.kind === 'mensalidade' && x.status === 'pendente' && x.method === 'recepcao')
  const history = db.payments.filter((x) => x.personId === ME_ID)
  const due = monthlyDue(db, ME_ID)

  return (
    <div className="space-y-4 px-5 pb-6 pt-4">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[.25em] text-highlight">Planos & Pagamento</div>
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide">Minha mensalidade</h1>
      </div>

      {/* Situação */}
      <div className={`rounded-2xl p-4 ring-1 ${st.box}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle">Plano atual</div>
            <div className="font-display text-2xl font-extrabold">{PLANS[me.plan].label}</div>
            <div className="text-xs text-fg-muted">{brl(priceOf(db, 'mensalidade', me.plan))} / mês</div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${st.tag}`}>
            {st.emoji} {BILLING_LABEL[bs.status]}
          </span>
        </div>
        <div className="mt-3 text-xs text-fg-soft">
          {bs.status === 'pago' && (
            <>
              Próximo vencimento: <b>{fmtDate(bs.due)}</b> {bs.daysToDue === 0 ? '(hoje)' : `(em ${bs.daysToDue} dias)`}
            </>
          )}
          {bs.status === 'carencia' && (
            <>
              Venceu em <b>{fmtDate(bs.due)}</b>. Você continua treinando normalmente {bs.left === 0 ? <b>só até hoje</b> : <>por mais <b>{bs.left} dia(s)</b></>} de carência. Depois disso, o acesso é suspenso automaticamente.
            </>
          )}
          {bs.status === 'bloqueado' && (
            <>
              Venceu em <b>{fmtDate(bs.due)}</b> e a carência de {g} dias terminou. <b>Novas reservas estão bloqueadas</b> e as reservas futuras foram liberadas para a lista de espera. Ao pagar, tudo volta na hora, inclusive a reserva fixa.
            </>
          )}
        </div>
        {due.discount > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs ring-1 ring-emerald-500/30">
            <span>🎁 Indique e Ganhe: desconto na próxima mensalidade</span>
            <b className="shrink-0 whitespace-nowrap text-emerald-700 dark:text-emerald-300">−{brl(due.discount)}</b>
          </div>
        )}
        {bs.status !== 'pago' && (
          <Btn className="mt-3 w-full py-3" onClick={() => setCheckout({ plan: me.plan })}>
            Pagar {brl(due.total)} agora
          </Btn>
        )}
        {bs.status === 'pago' && (
          <Btn variant="dark" className="mt-3 w-full" onClick={() => setCheckout({ plan: me.plan })}>
            Antecipar próxima mensalidade
          </Btn>
        )}
        {pendingDesk && <p className="mt-2 text-[11px] text-fg-muted">🏪 Você escolheu pagar na recepção ({brl(pendingDesk.amount)}). Assim que o gestor der baixa, sua situação é atualizada.</p>}
      </div>

      {/* Planos */}
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-muted">Pacotes</h2>
        <div className="space-y-2">
          {Object.entries(PLANS).map(([k, p]) => {
            const current = k === me.plan
            return (
              <div key={k} className={`flex items-center gap-3 rounded-2xl p-3.5 ring-1 ${current ? 'bg-accent/10 ring-accent/50' : 'bg-card ring-line'}`}>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-inverse font-display text-lg font-extrabold text-on-inverse">{k === 'ilimitado' ? '∞' : k}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{p.label}</div>
                  <div className="text-[11px] text-fg-subtle">{k === 'ilimitado' ? 'Treine todos os dias' : `${p.limit} treinos por semana`} • reserva fixa inclusa</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-bold">{brl(priceOf(db, 'mensalidade', k))}</div>
                  {current ? (
                    <span className="text-[10px] font-bold uppercase text-highlight">
                      <Check size={10} className="inline" /> Seu plano
                    </span>
                  ) : (
                    <button onClick={() => setCheckout({ plan: k })} className="text-[10px] font-bold uppercase text-highlight underline">
                      Mudar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Avulsos */}
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-muted">Aulas avulsas</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => nav('agenda')} className="rounded-2xl bg-card p-3 text-left ring-1 ring-line">
            <Zap size={18} className="text-highlight" />
            <div className="mt-1 text-sm font-bold">Treino extra</div>
            <div className="text-[11px] text-fg-subtle">{brl(priceOf(db, 'extra'))} • quando o limite da semana acabar</div>
          </button>
          <button onClick={() => nav('agenda')} className="rounded-2xl bg-card p-3 text-left ring-1 ring-line">
            <Globe2 size={18} className="text-highlight" />
            <div className="mt-1 text-sm font-bold">Drop-in</div>
            <div className="text-[11px] text-fg-subtle">{brl(priceOf(db, 'dropin'))} • para quem é de outro box</div>
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-fg-subtle">
          <Lock size={11} /> Aula avulsa paga por Pix/Cartão fica pré-reservada por 15 min até o pagamento ser confirmado.
        </p>
      </div>

      {/* Histórico */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <Receipt size={13} /> Histórico de pagamentos
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
          {history.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
              <span className="text-lg">{PAY_METHODS[x.method].emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {KIND_LABEL[x.kind]}
                  {x.plan ? ` • ${PLANS[x.plan].label}` : ''}
                </div>
                <div className="text-[10px] text-fg-subtle">
                  {PAY_METHODS[x.method].label} • {x.paidAt || x.createdAt}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold">{brl(x.amount)}</div>
                <div className={`text-[10px] font-bold uppercase ${PAY_STATUS[x.status]}`}>{x.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controle só da demonstração */}
      <div className="rounded-2xl border border-dashed border-fuchsia-500/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">
          <CalendarCheck size={12} /> Demo: simular situação da mensalidade
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['pago', '✅ Em dia'],
            ['carencia', '⏳ Carência'],
            ['bloqueado', '🔒 Bloqueado'],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => demoSetBilling(k)}
              className={`rounded-lg py-2 text-[11px] font-bold ring-1 ${bs.status === k ? 'bg-inverse text-on-inverse ring-transparent' : 'bg-card ring-line'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-fg-subtle">Carência atual do box: {g} dia(s), configurável em Coach/Gestão → Financeiro.</p>
      </div>

      {bs.status === 'bloqueado' && <Alert kind="info">Dica de demo: ative uma reserva fixa antes de simular o bloqueio. Ao pagar, ela volta a reservar as aulas da semana sozinha.</Alert>}

      <Checkout db={db} open={!!checkout} onClose={() => setCheckout(null)} kind="mensalidade" plan={checkout?.plan} title={checkout?.plan !== me.plan ? 'Mudar de plano' : 'Pagar mensalidade'} />
    </div>
  )
}
