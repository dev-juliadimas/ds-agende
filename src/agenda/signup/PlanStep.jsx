/*
 * Etapa 2 do auto-cadastro: escolha do plano.
 * Lista o catálogo do box (plans, via get_signup_plans) em 3 níveis:
 *   família (Plano Total, HY-FITNESS, Sem fidelidade) → frequência → período.
 * Mais a opção "Quero começar com uma Aula Experimental" (sem plano).
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { brl } from '../../lib/constants'
import * as api from '../../lib/api/agenda'

const FAMILY = {
  TOTAL: { label: 'Plano Total', blurb: 'Todas as modalidades do box.' },
  'HY-FITNESS': { label: 'HY-FITNESS', blurb: 'Treinos de HYROX / HY-FITNESS.' },
  AVULSO: { label: 'Sem fidelidade', blurb: 'Para começar devagar ou treinar de vez em quando.' },
}
const PERIOD = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', avulso: 'Por aula' }

const freqKey = (p) => (p.kind === 'aula_avulsa' ? 'avulsa' : p.weekly_limit == null ? 'livre' : String(p.weekly_limit))
const freqLabel = (k) => (k === 'avulsa' ? 'Aula avulsa' : k === 'livre' ? 'Livre' : `${k}x/semana`)

function Chip({ active, onClick, children, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 flex-col items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active ? 'bg-accent text-on-accent shadow-sm' : 'bg-elevated text-fg-soft ring-1 ring-line hover:ring-line-strong'
      }`}
    >
      {children}
      {sub && <span className={`text-[11px] font-medium ${active ? 'text-on-accent/80' : 'text-fg-subtle'}`}>{sub}</span>}
    </button>
  )
}

function Radio({ active }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ${active ? 'bg-accent ring-accent' : 'ring-line-strong'}`}>
      {active && <Check size={12} strokeWidth={3} className="text-on-accent" />}
    </span>
  )
}

export default function PlanStep({ boxId, trial, planId, onChange }) {
  const [plans, setPlans] = useState(null)
  const [failed, setFailed] = useState(false)
  const [family, setFamily] = useState(null)
  const [freq, setFreq] = useState(null)

  const load = () => {
    setFailed(false)
    setPlans(null)
    api
      .fetchSignupPlans(boxId)
      .then(setPlans)
      .catch(() => setFailed(true))
  }
  useEffect(load, [boxId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Família → frequências → períodos, na ordem do catálogo (display_order)
  const tree = useMemo(() => {
    const fam = new Map()
    for (const p of plans || []) {
      if (!fam.has(p.family)) fam.set(p.family, { key: p.family, plans: [], freqs: new Map(), modalities: new Set() })
      const f = fam.get(p.family)
      f.plans.push(p)
      p.modalities?.forEach((m) => f.modalities.add(m))
      const k = freqKey(p)
      if (!f.freqs.has(k)) f.freqs.set(k, [])
      f.freqs.get(k).push(p)
    }
    return [...fam.values()]
  }, [plans])

  // Voltou para esta etapa com um plano já escolhido: reabre família/frequência dele
  useEffect(() => {
    if (!plans || !planId || family) return
    const p = plans.find((x) => x.id === planId)
    if (p) {
      setFamily(p.family)
      setFreq(freqKey(p))
    }
  }, [plans, planId, family])

  const chosen = plans?.find((p) => p.id === planId)

  const pickFamily = (f) => {
    if (!trial && family === f.key) return
    setFamily(f.key)
    // frequência e período: pré-seleciona o primeiro (o mais comum fica no topo do catálogo)
    const [k, list] = [...f.freqs.entries()][0]
    setFreq(k)
    onChange({ trial: false, planId: list[0].id })
  }
  const pickFreq = (f, k) => {
    setFreq(k)
    const list = f.freqs.get(k)
    // mantém o período escolhido se existir nesta frequência
    const same = list.find((p) => p.period === chosen?.period)
    onChange({ trial: false, planId: (same || list[0]).id })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">Escolha como quer treinar. O pagamento é feito depois, com o box.</p>

      {/* Aula experimental */}
      <button
        type="button"
        onClick={() => {
          setFamily(null)
          onChange({ trial: true, planId: null })
        }}
        aria-pressed={trial}
        className={`flex w-full items-start gap-3 rounded-2xl p-4 text-left transition ${
          trial ? 'bg-card ring-2 ring-accent' : 'bg-card ring-1 ring-line hover:ring-line-strong'
        }`}
      >
        <Radio active={trial} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-display text-lg font-bold uppercase leading-tight">
            <Sparkles size={16} className="text-highlight" /> Quero começar com uma Aula Experimental
          </span>
          <span className="mt-0.5 block text-sm text-fg-muted">Sem compromisso: conheça o box e escolha o plano depois.</span>
        </span>
      </button>

      <div className="flex items-center gap-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
        <span className="h-px flex-1 bg-line" /> ou escolha um plano <span className="h-px flex-1 bg-line" />
      </div>

      {!plans && !failed && (
        <div className="flex justify-center py-8 text-fg-muted">
          <Loader2 className="animate-spin" size={22} aria-label="Carregando planos" />
        </div>
      )}
      {failed && (
        <div className="rounded-2xl bg-card p-4 text-center text-sm text-fg-muted ring-1 ring-line">
          Não foi possível carregar os planos.
          <button type="button" onClick={load} className="mx-auto mt-2 flex items-center gap-1.5 font-semibold text-fg hover:text-highlight">
            <RefreshCw size={14} /> Tentar de novo
          </button>
        </div>
      )}
      {plans && plans.length === 0 && (
        <p className="rounded-2xl bg-card p-4 text-sm text-fg-muted ring-1 ring-line">
          O box ainda não publicou os planos. Comece pela aula experimental.
        </p>
      )}

      {tree.map((f) => {
        const open = !trial && family === f.key
        const meta = FAMILY[f.key] || { label: f.key, blurb: '' }
        const from = Math.min(...f.plans.map((p) => Number(p.monthly_price)))
        const periods = open && freq ? f.freqs.get(freq) || [] : []
        return (
          <div key={f.key} className={`rounded-2xl bg-card transition ${open ? 'ring-2 ring-accent' : 'ring-1 ring-line'}`}>
            <button type="button" onClick={() => pickFamily(f)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
              <Radio active={open} />
              <span className="min-w-0 flex-1">
                <span className="font-display text-lg font-bold uppercase leading-tight">{meta.label}</span>
                <span className="mt-0.5 block text-sm text-fg-muted">{meta.blurb}</span>
                {f.modalities.size > 0 && f.key !== 'AVULSO' && (
                  <span className="mt-1 block text-xs text-fg-subtle">{[...f.modalities].join(' · ')}</span>
                )}
              </span>
              <span className="shrink-0 text-right text-xs text-fg-subtle">
                a partir de
                <span className="block font-display text-base font-bold text-fg">{brl(from)}</span>
              </span>
            </button>

            {open && (
              <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">Frequência</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {[...f.freqs.keys()].map((k) => (
                      <Chip key={k} active={freq === k} onClick={() => pickFreq(f, k)}>
                        {freqLabel(k)}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
                {periods.length > 0 && (
                  <fieldset>
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">Período</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {periods.map((p) => (
                        <Chip
                          key={p.id}
                          active={planId === p.id}
                          onClick={() => onChange({ trial: false, planId: p.id })}
                          sub={p.kind === 'aula_avulsa' ? `${brl(p.monthly_price)}` : `${brl(p.monthly_price)}/mês`}
                        >
                          {PERIOD[p.period] || p.period}
                        </Chip>
                      ))}
                    </div>
                  </fieldset>
                )}
                {chosen && chosen.family === f.key && (
                  <div className="rounded-xl bg-elevated px-3 py-2.5 text-sm">
                    <div className="font-semibold">{chosen.name}</div>
                    <div className="text-fg-muted">
                      {chosen.kind === 'aula_avulsa'
                        ? `${brl(chosen.total_price)} por aula`
                        : chosen.months > 1
                          ? `${brl(chosen.monthly_price)}/mês · total ${brl(chosen.total_price)} em ${chosen.months} meses`
                          : `${brl(chosen.monthly_price)}/mês`}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
