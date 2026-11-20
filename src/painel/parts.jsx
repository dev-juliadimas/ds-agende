/*
 * Peças do Painel do administrador: linha de pessoa (com detalhes e ficha de saúde),
 * linha de interessado do formulário, chips de situação e baixa de pagamento.
 */
import { useState } from 'react'
import { AlertTriangle, ChevronDown, HeartPulse, Loader2, MessageCircle, Wallet } from 'lucide-react'
import { brl } from '../lib/constants'
import * as api from '../lib/api/painel'
import { QUESTIONS } from '../agenda/signup/HealthStep'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const fmtDate = (d) => {
  if (!d) return '—'
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return `${dd} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`
}
const fmtDateTime = (ts) =>
  ts ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)) : '—'
const firstName = (n) => String(n || '').split(' ')[0]

const TONE = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  err: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  info: 'bg-accent/15 text-highlight',
  muted: 'bg-elevated text-fg-muted',
}
export function Chip({ tone = 'muted', children }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[tone]}`}>{children}</span>
}

const ROLE = { owner: 'Administrador', coach: 'Coach', aluno: 'Aluno', visitante: 'Experimental', dropin: 'Aula avulsa' }

/** Situação principal de uma pessoa, para o chip. */
export function memberStatus(m) {
  if (m.role === 'owner' || m.role === 'coach') return m.active === false ? { tone: 'muted', label: `${ROLE[m.role]} · inativo` } : { tone: 'info', label: ROLE[m.role] }
  if (m.role === 'visitante') return m.trial_done ? { tone: 'warn', label: 'Fez a experimental' } : { tone: 'info', label: 'Experimental' }
  if (m.financial_status === 'aguardando_pagamento' && m.billing === 'pago') return { tone: 'warn', label: 'Aguardando 1º pagamento' }
  if (m.billing === 'bloqueado') return { tone: 'err', label: `Bloqueado · ${m.days_late}d` }
  if (m.billing === 'carencia') return { tone: 'warn', label: `Carência · ${m.days_late}d` }
  return { tone: 'ok', label: 'Em dia' }
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function WaButton({ phone, text, label = 'WhatsApp' }) {
  return (
    <a
      href={api.waLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-wa px-3 text-xs font-bold text-white hover:opacity-90"
    >
      <MessageCircle size={14} /> {label}
    </a>
  )
}

/** Baixa manual: escolhe a forma e confirma (confirm_payment). */
export function PayButton({ m, notify, onChanged }) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState('pix')
  const [busy, setBusy] = useState(false)
  if (!m.pending_payment_id) return null
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent hover:bg-accent-strong">
        <Wallet size={14} /> Dar baixa {brl(m.pending_amount)}
      </button>
    )
  }
  const go = async () => {
    setBusy(true)
    const res = await api.confirmPayment({ paymentId: m.pending_payment_id, method })
    setBusy(false)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) onChanged()
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-elevated p-1.5 ring-1 ring-line">
      <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Forma de pagamento" className="min-h-8 rounded-md bg-card px-2 text-xs font-semibold ring-1 ring-line">
        <option value="pix">Pix</option>
        <option value="dinheiro">Dinheiro</option>
        <option value="maquininha">Maquininha</option>
      </select>
      <button onClick={go} disabled={busy} className="inline-flex min-h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-60">
        {busy && <Loader2 size={12} className="animate-spin" />} Confirmar {brl(m.pending_amount)}
      </button>
      <button onClick={() => setOpen(false)} className="px-2 text-xs font-semibold text-fg-muted hover:text-fg">
        Voltar
      </button>
    </div>
  )
}

export function HealthForm({ personId }) {
  const [state, setState] = useState({ status: 'idle' })
  const load = async () => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ok', form: await api.fetchHealthForm(personId) })
    } catch (e) {
      setState({ status: 'error', message: e.message })
    }
  }
  if (state.status === 'idle') {
    return (
      <button onClick={load} className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-soft underline decoration-accent underline-offset-4 hover:text-fg">
        <HeartPulse size={14} className="text-highlight" /> Ver ficha de saúde
      </button>
    )
  }
  if (state.status === 'loading') return <Loader2 size={16} className="animate-spin text-fg-muted" />
  if (state.status === 'error') return <p className="text-xs text-rose-600 dark:text-rose-300">{state.message}</p>
  const f = state.form
  if (!f) return <p className="text-xs text-fg-subtle">Sem ficha de saúde (cadastro feito pela recepção).</p>
  const hasPARQ = QUESTIONS.some((q) => typeof f[q.key] === 'boolean')
  return (
    <div className="rounded-xl bg-elevated p-3 text-xs ring-1 ring-line">
      <div className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wider text-fg-muted">
        <HeartPulse size={13} className="text-highlight" /> Ficha de saúde (PAR-Q)
      </div>
      {hasPARQ ? (
        <ol className="space-y-1.5">
          {QUESTIONS.map((q) => (
            <li key={q.key} className="flex gap-2">
              <span className={`w-8 shrink-0 font-bold ${f[q.key] ? 'text-rose-600 dark:text-rose-300' : 'text-fg-subtle'}`}>{f[q.key] ? 'Sim' : 'Não'}</span>
              <span className="text-fg-soft">
                {q.text}
                {f[q.info] && <span className="mt-0.5 block font-semibold text-fg">“{f[q.info]}”</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        f.injuries && <p className="text-fg-soft">Lesões: {f.injuries}</p>
      )}
      {f.coach_notes && <p className="mt-2 border-t border-line pt-2 text-fg-soft">Observação: <b className="text-fg">{f.coach_notes}</b></p>}
      <p className="mt-2 text-[10px] text-fg-subtle">Consentimento LGPD em {fmtDateTime(f.consent_at)}{f.consent_version ? ` · ${f.consent_version}` : ''}</p>
    </div>
  )
}

/**
 * Pessoa com detalhes ao tocar. `aside` = texto à direita (ex.: dia do aniversário);
 * `actions` = botões sempre visíveis (ex.: WhatsApp de cobrança).
 */
export function MemberRow({ m, aside, sub, actions, notify, onChanged, highlight }) {
  const [open, setOpen] = useState(false)
  const st = memberStatus(m)
  return (
    <li className={`rounded-2xl bg-card ring-1 ${highlight ? 'ring-2 ring-accent' : 'ring-line'}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {aside}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{m.name}</span>
            {m.health_attention && <AlertTriangle size={13} className="shrink-0 text-amber-600 dark:text-amber-300" aria-label="Atenção na ficha de saúde" />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            <Chip tone={st.tone}>{st.label}</Chip>
            {sub ?? (m.plan_name && <span className="truncate">{m.plan_name}</span>)}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-fg-subtle transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {actions && <div className="flex flex-wrap gap-2 px-4 pb-3">{actions}</div>}
      {open && (
        <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Detail label="WhatsApp">{m.phone}</Detail>
            <Detail label="Papel">{ROLE[m.role] || m.role}</Detail>
            <Detail label="Plano">{m.plan_name || '—'}</Detail>
            <Detail label="Vencimento">{fmtDate(m.due_date)}</Detail>
            <Detail label="Nascimento">{m.birth_day ? `${m.birth_day} ${MONTHS[m.birth_month - 1]}${m.age != null ? ` · ${m.age} anos` : ''}` : '—'}</Detail>
            <Detail label="Aulas (30 dias)">{m.classes_30d}</Detail>
            <Detail label="Última aula">{m.last_class_at ? `${fmtDateTime(m.last_class_at)} · ${m.last_class_status}` : '—'}</Detail>
            <Detail label="Cadastro">{m.self_signup_at ? `Pelo app · ${fmtDate(m.self_signup_at)}` : `Recepção · ${fmtDate(m.created_at)}`}</Detail>
          </dl>
          {m.role !== 'owner' && <HealthForm personId={m.person_id} />}
          <div className="flex flex-wrap gap-2">
            <WaButton phone={m.phone} text={`Olá, ${firstName(m.name)}! Aqui é do box.`} />
            <PayButton m={m} notify={notify} onChanged={onChanged} />
          </div>
        </div>
      )}
    </li>
  )
}

const LEAD_STATUS = { novo: ['info', 'Novo'], contatado: ['warn', 'Contatado'], convertido: ['ok', 'Convertido'], descartado: ['muted', 'Arquivado'] }

export function LeadRow({ l, box, notify, onChanged }) {
  const [busy, setBusy] = useState(null)
  const setStatus = async (status) => {
    setBusy(status)
    const res = await api.updateLead({ leadId: l.id, status })
    setBusy(null)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) onChanged()
  }
  const [tone, label] = LEAD_STATUS[l.status] || LEAD_STATUS.novo
  const btn = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold ring-1 ring-line hover:bg-elevated disabled:opacity-60'
  return (
    <li className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{l.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            <Chip tone={tone}>{label}</Chip>
            {l.interest && <span>{l.interest}</span>}
            <span className="text-fg-subtle">· {fmtDateTime(l.created_at)}</span>
          </div>
        </div>
      </div>
      {l.message && <p className="mt-2 rounded-xl bg-elevated px-3 py-2 text-sm text-fg-soft">“{l.message}”</p>}
      {l.member_name && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Esse WhatsApp já é de {l.member_name} no box.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <WaButton phone={l.phone} text={`Olá, ${firstName(l.name)}! Aqui é do ${box.name}. Vi que você tem interesse em treinar com a gente 😊`} label="Chamar" />
        {l.status === 'novo' && (
          <button onClick={() => setStatus('contatado')} disabled={!!busy} className={btn}>
            {busy === 'contatado' && <Loader2 size={12} className="animate-spin" />} Contatado
          </button>
        )}
        {l.status !== 'convertido' && (
          <button onClick={() => setStatus('convertido')} disabled={!!busy} className={btn}>
            {busy === 'convertido' && <Loader2 size={12} className="animate-spin" />} Virou aluno
          </button>
        )}
        {l.status !== 'descartado' ? (
          <button onClick={() => setStatus('descartado')} disabled={!!busy} className={`${btn} text-fg-muted`}>
            Arquivar
          </button>
        ) : (
          <button onClick={() => setStatus('novo')} disabled={!!busy} className={`${btn} text-fg-muted`}>
            Reabrir
          </button>
        )}
      </div>
    </li>
  )
}
