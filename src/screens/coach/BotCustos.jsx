import { Bot, Info, MessageCircleReply } from 'lucide-react'
import { DISPATCHES, META_PRICE, brl } from '../../lib/constants'
import { updateSettings } from '../../lib/store'

export default function BotCustos({ db }) {
  const on = db.settings.dispatches
  const monthly = (list) => list.reduce((a, d) => a + d.perMonth * META_PRICE[d.cat], 0)
  const active = DISPATCHES.filter((d) => on[d.k])
  const spent = db.metaLog.reduce((a, x) => a + x.cost, 0)
  const freeCount = db.metaLog.filter((x) => x.free).length

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/30">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          <MessageCircleReply size={16} /> Atendimento receptivo: custo zero
        </div>
        <p className="mt-1 text-xs text-fg-soft">
          Quando o aluno chama o bot primeiro (ver horários, reservar, cancelar, aula experimental, responder à lista de espera), a janela de 24h fica aberta e as respostas não são cobradas pela Meta. Isso fica sempre ligado.
        </p>
      </div>

      <div className="rounded-2xl bg-card/70 p-4 ring-1 ring-line">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <Bot size={14} /> Disparos ativos (o robô inicia a conversa)
        </div>
        <p className="mb-3 text-[11px] text-fg-subtle">Fora da janela de 24h, cada mensagem iniciada pelo robô é cobrada pela Meta. Ligue só o que vale a pena para o box.</p>
        <div className="space-y-1.5">
          {DISPATCHES.map((d) => {
            const cost = d.perMonth * META_PRICE[d.cat]
            return (
              <label key={d.k} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${on[d.k] ? 'bg-surface/70 ring-accent/40' : 'bg-surface/30 ring-line'}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{d.label}</div>
                  <div className="text-[10px] text-fg-subtle">
                    <span className={`mr-1 rounded px-1 py-px font-bold uppercase ${d.cat === 'marketing' ? 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}`}>{d.cat}</span>~{d.perMonth} msg/mês • ~{brl(cost)}/mês
                  </div>
                </div>
                <input type="checkbox" className="h-5 w-5 accent-accent" checked={!!on[d.k]} onChange={(e) => updateSettings({ dispatches: { ...on, [d.k]: e.target.checked } })} />
              </label>
            )
          })}
        </div>
        <div className="mt-3 flex items-end justify-between rounded-xl bg-inverse px-4 py-3 text-on-inverse">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">Estimativa mensal</div>
            <div className="font-display text-3xl font-extrabold">{brl(monthly(active))}</div>
          </div>
          <div className="text-right text-[10px] opacity-70">
            tudo ligado: {brl(monthly(DISPATCHES))}
            <br />
            economia: {brl(monthly(DISPATCHES) - monthly(active))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card/70 p-4 ring-1 ring-line">
        <div className="text-xs font-bold uppercase tracking-wider text-fg-muted">Nesta demonstração</div>
        <p className="mt-1 text-sm">
          <b>{db.metaLog.length}</b> disparo(s) enviados • <b>{freeCount}</b> grátis (janela aberta) • custo estimado <b>{brl(spent)}</b>
        </p>
      </div>

      <p className="flex gap-1.5 text-[10px] text-fg-subtle">
        <Info size={12} className="shrink-0" />
        Valores de referência por mensagem no Brasil (utilidade ~{brl(META_PRICE.utilidade)}, marketing ~{brl(META_PRICE.marketing)}). A Meta muda a tabela periodicamente: confira o preço vigente antes de contratar. Volumes estimados para um box de ~40 alunos.
      </p>
    </div>
  )
}
