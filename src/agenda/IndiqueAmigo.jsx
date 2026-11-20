/*
 * Card "Indique um amigo" (Indique e Ganhe) — usado na aba Perfil do aluno.
 * Props: box ({ id, name }), slug (da rota), notify(msg, 'ok'|'err').
 *
 * my_referral gera o código na 1ª vez e devolve quantas indicações estão
 * aguardando a 1ª mensalidade (pending), liberadas (earned) e já usadas (used).
 * Regras no banco: supabase/migrations/20261130_indique_ganhe.sql.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Gift, Loader2, MessageCircle, RefreshCw } from 'lucide-react'
import * as api from '../lib/api/agenda'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // navegador sem permissão de clipboard
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      return ok
    } catch {
      return false
    }
  }
}

export default function IndiqueAmigo({ box, slug, notify }) {
  const [state, setState] = useState({ status: 'loading', data: null })
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setState({ status: 'loading', data: null })
    try {
      setState({ status: 'ready', data: await api.fetchMyReferral(box.id) })
    } catch {
      setState({ status: 'error', data: null })
    }
  }, [box.id])

  useEffect(() => {
    load()
  }, [load])

  const ref = state.data
  const link = ref?.code ? api.referralUrl(slug, ref.code) : ''
  const message = `Bora treinar comigo no ${box.name}? Faz seu cadastro por este link: ${link}`

  const onCopy = async () => {
    const ok = await copyText(link)
    if (!ok) return notify('Não deu para copiar. Segure o link para copiar manualmente.', 'err')
    setCopied(true)
    notify('Link copiado!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="rounded-2xl bg-card p-5 ring-1 ring-line" aria-labelledby="indique-titulo">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-highlight">
          <Gift size={20} />
        </span>
        <div className="min-w-0">
          <h2 id="indique-titulo" className="font-display text-xl font-bold uppercase leading-tight">Indique um amigo</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Mande seu link. Quando seu amigo se cadastrar por ele e ativar o primeiro plano, você ganha uma recompensa do {box.name}.
          </p>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="mt-5 flex items-center justify-center gap-2 py-4 text-sm text-fg-muted">
          <Loader2 size={16} className="animate-spin" /> Gerando seu link…
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-5 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300">
          Não foi possível carregar seu link.{' '}
          <button onClick={load} className="inline-flex items-center gap-1 font-semibold underline underline-offset-4">
            <RefreshCw size={13} /> Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && ref?.code && (
        <>
          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Seu código</div>
            <div className="mt-1 font-display text-2xl font-bold tracking-[.2em]">{ref.code}</div>
            <div className="mt-2 truncate rounded-lg bg-elevated px-3 py-2 font-mono text-xs text-fg-muted ring-1 ring-line" title={link}>
              {link}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-elevated px-3 py-3 text-sm font-bold text-fg ring-1 ring-line transition hover:bg-canvas active:scale-[.98]"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 py-3 text-sm font-bold text-[#0b2e17] transition hover:brightness-95 active:scale-[.98]"
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Stat label="Aguardando plano" value={ref.pending} />
            <Stat label="Recompensas" value={ref.earned} highlight />
            <Stat label="Já usadas" value={ref.used} />
          </dl>
          {ref.earned > 0 && (
            <p className="mt-3 text-center text-xs text-fg-muted">Fale com a recepção para usar sua recompensa. 🎉</p>
          )}
        </>
      )}
    </section>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-xl px-2 py-3 ring-1 ${highlight && value > 0 ? 'bg-accent/15 ring-accent/40' : 'bg-elevated ring-line'}`}>
      <dd className="font-display text-2xl font-bold">{value ?? 0}</dd>
      <dt className="mt-0.5 text-[11px] leading-tight text-fg-muted">{label}</dt>
    </div>
  )
}
