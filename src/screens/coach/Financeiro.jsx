import { useState } from 'react'
import { Banknote, Gift, MessageCircle, Settings2, Wallet } from 'lucide-react'
import { PAY_METHODS, PLANS, brl, fmtDate } from '../../lib/constants'
import { BILLING_LABEL, KIND_LABEL, billingStatus, confirmPayment, financeSummary, referralRuleLabel, startCheckout, toast, updateSettings } from '../../lib/store'
import { Chip, Stat, inputCls } from '../../components/ui'

const waLink = (phone, text) => `https://wa.me/55${(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
const TAG = {
  pago: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  carencia: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  bloqueado: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

function Card({ title, children, right }) {
  return (
    <div className="rounded-2xl bg-card/70 p-4 ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function BaixaButtons({ onPick }) {
  return (
    <div className="flex gap-1">
      {['dinheiro', 'maquininha'].map((m) => (
        <button key={m} onClick={() => onPick(m)} className="rounded-lg bg-inverse px-2 py-1 text-[10px] font-bold text-on-inverse" title={PAY_METHODS[m].label}>
          {PAY_METHODS[m].emoji} {m === 'dinheiro' ? 'Dinheiro' : 'Maquininha'}
        </button>
      ))}
    </div>
  )
}

export default function Financeiro({ db }) {
  const f = financeSummary(db)
  const [filter, setFilter] = useState('carencia')
  const [baixa, setBaixa] = useState(null)
  const prices = db.settings.prices
  const list = (filter === 'todos' ? [...f.by.bloqueado, ...f.by.carencia, ...f.by.pago] : f.by[filter]).slice(0, 40)

  const baixaMensalidade = (p, method) => {
    const r = startCheckout({ kind: 'mensalidade', personId: p.id, plan: p.plan, method: 'recepcao', source: 'coach' })
    if (r.ok) confirmPayment(r.payment.id, { method })
    toast(`Baixa registrada: ${p.name.split(' ')[0]} • ${PAY_METHODS[method].label}`)
    setBaixa(null)
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Em dia" value={f.by.pago.length} sub={brl(f.emDia)} accent="text-emerald-600 dark:text-emerald-300" />
        <Stat label="Carência" value={f.by.carencia.length} sub="treinando" accent="text-amber-600 dark:text-amber-300" />
        <Stat label="Bloqueados" value={f.by.bloqueado.length} sub="sem reservas" accent="text-rose-600 dark:text-rose-300" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Receita prevista / mês" value={brl(f.mrr)} sub={`${f.total} alunos ativos`} />
        <Stat label="Em aberto" value={brl(f.aberto)} sub={`recebido nesta demo: ${brl(f.recebidoDemo)}`} accent="text-rose-600 dark:text-rose-300" />
      </div>

      {/* Baixa manual */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <Banknote size={14} /> Pagamentos na recepção ({f.pendentesRecepcao.length})
          </span>
        }
      >
        {!f.pendentesRecepcao.length && <p className="text-[11px] text-fg-subtle">Nenhum pagamento aguardando baixa. Quando um aluno ou visitante escolhe “Pagar na recepção”, ele aparece aqui.</p>}
        <div className="space-y-1.5">
          {f.pendentesRecepcao.map((x) => {
            const p = db.people[x.personId]
            const b = x.bookingId && db.bookings.find((y) => y.id === x.bookingId)
            const slot = b && db.slots.find((s) => s.id === b.slotId)
            return (
              <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-[10px] text-fg-muted">
                    {KIND_LABEL[x.kind]}
                    {x.plan ? ` • ${PLANS[x.plan].label}` : ''}
                    {slot ? ` • aula ${slot.day.toUpperCase()} ${slot.time}` : ''} • {brl(x.amount)}
                  </div>
                </div>
                <BaixaButtons
                  onPick={(m) => {
                    const r = confirmPayment(x.id, { method: m })
                    toast(r.ok ? `Baixa registrada: ${p.name.split(' ')[0]} • ${PAY_METHODS[m].label}` : r.msg, r.ok ? 'ok' : 'err')
                  }}
                />
              </div>
            )
          })}
        </div>
      </Card>

      {/* Alunos por situação */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <Wallet size={14} /> Mensalidades
          </span>
        }
      >
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 no-scrollbar">
          {[
            ['carencia', `Carência (${f.by.carencia.length})`],
            ['bloqueado', `Bloqueados (${f.by.bloqueado.length})`],
            ['pago', `Em dia (${f.by.pago.length})`],
            ['todos', 'Todos'],
          ].map(([k, l]) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {l}
            </Chip>
          ))}
        </div>
        <div className="space-y-1.5">
          {!list.length && <p className="text-[11px] text-fg-subtle">Ninguém nesta situação.</p>}
          {list.map((p) => {
            const bs = billingStatus(db, p.id)
            const first = p.name.split(' ')[0]
            return (
              <div key={p.id} className="rounded-xl bg-surface/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-[10px] text-fg-muted">
                      {PLANS[p.plan].label} • {brl(prices[p.plan])} • vence {fmtDate(bs.due)}
                      {bs.status === 'carencia' && ` • ${bs.left === 0 ? 'último dia' : `${bs.left}d de carência`}`}
                      {bs.status === 'bloqueado' && ` • ${bs.late}d em atraso`}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${TAG[bs.status]}`}>{BILLING_LABEL[bs.status]}</span>
                </div>
                {bs.status !== 'pago' && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {baixa === p.id ? (
                      <BaixaButtons onPick={(m) => baixaMensalidade(p, m)} />
                    ) : (
                      <button onClick={() => setBaixa(p.id)} className="rounded-lg bg-card px-2 py-1 text-[10px] font-bold ring-1 ring-line">
                        Dar baixa presencial
                      </button>
                    )}
                    <a
                      href={waLink(p.phone, `Oi, ${first}! Aqui é do Içara Cross. Sua mensalidade venceu em ${fmtDate(bs.due)}. Consegue regularizar pelo app ou na recepção? 💪`)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-wa-light px-2 py-1 text-[10px] font-bold text-white"
                    >
                      <MessageCircle size={11} /> Cobrar no meu WhatsApp
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Regras */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <Settings2 size={14} /> Regra de carência e preços
          </span>
        }
      >
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Dias de carência
            <span className="block text-[11px] text-fg-subtle">Após o vencimento o aluno treina normalmente e recebe alertas. Depois disso, bloqueio automático.</span>
          </span>
          <input
            type="number"
            min={0}
            max={15}
            className={`${inputCls} w-20 text-center`}
            value={db.settings.graceDays}
            onChange={(e) => updateSettings({ graceDays: Math.max(0, Math.min(15, Number(e.target.value) || 0)) })}
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ['2x', 'Plano 2x'],
            ['3x', 'Plano 3x'],
            ['ilimitado', 'Ilimitado'],
            ['dropin', 'Drop-in'],
            ['extra', 'Treino extra'],
          ].map(([k, l]) => (
            <label key={k} className="block text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
              {l}
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs text-fg-subtle">R$</span>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={prices[k]}
                  onChange={(e) => updateSettings({ prices: { ...prices, [k]: Math.max(0, Number(e.target.value) || 0) } })}
                />
              </div>
            </label>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-fg-subtle">Formas aceitas: Pix e Cartão pelo gateway (baixa automática via webhook) e Dinheiro/Maquininha na recepção (baixa manual aqui).</p>
      </Card>

      <ReferralConfig db={db} />
    </div>
  )
}

// Indique e Ganhe: o dono define quanto quem indica ganha por amigo matriculado
function ReferralConfig({ db }) {
  const rule = db.settings.referral
  const setRule = (patch) => updateSettings({ referral: { ...rule, ...patch } })
  const max = rule.type === 'pct' ? 100 : 1000
  const credits = Object.values(db.people).flatMap((p) => (p.referralCredits || []).map((c) => ({ ...c, p })))
  const pending = credits.filter((c) => c.status === 'disponivel').length
  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <Gift size={14} /> Indique e Ganhe
        </span>
      }
      right={<span className="text-[10px] font-bold text-highlight">{referralRuleLabel(rule)} por amigo</span>}
    >
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 rounded-lg bg-surface p-0.5 ring-1 ring-line">
          {[
            ['fixed', 'R$'],
            ['pct', '%'],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setRule({ type: k, value: Math.min(k === 'pct' ? 100 : 1000, rule.value) })}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${rule.type === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted'}`}
              aria-pressed={rule.type === k}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          max={max}
          step={rule.type === 'pct' ? 1 : 5}
          aria-label="Desconto por indicação"
          className={`${inputCls} text-center`}
          value={rule.value}
          onChange={(e) => setRule({ value: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })}
        />
      </div>
      <p className="mt-2 text-[11px] text-fg-subtle">
        Desconto na próxima mensalidade de quem indicou. Entra sozinho quando o amigo valida presença na aula experimental e fecha matrícula (botão <b>Matricular</b> em Turmas). Créditos já ganhos mantêm o valor da época.
      </p>
      <p className="mt-2 text-[11px] text-fg-muted">
        {credits.length} crédito(s) gerado(s) • {pending} aguardando a próxima mensalidade
      </p>
    </Card>
  )
}
