import { Check, Copy, Gift, MessageCircle } from 'lucide-react'
import { BOX, ME_ID, brl } from '../lib/constants'
import { demoReferralFriend, referralLink, referralRuleLabel, referralSummary, toast } from '../lib/store'

const STAGE = {
  agendado: { label: 'Aula agendada', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  aula: { label: 'Fez a aula', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  matriculado: { label: 'Matriculado', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback para navegadores sem permissão de clipboard
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

export default function IndiqueGanhe({ db, pid = ME_ID }) {
  const link = referralLink(db, pid)
  const url = `https://${link}`
  const rule = db.settings.referral
  const r = referralSummary(db, pid)
  const reward = referralRuleLabel(rule)
  const n = r.enrolled

  const copy = async () => {
    const ok = await copyText(url)
    toast(ok ? 'Link copiado! Agora é só colar para o seu amigo.' : `Não deu para copiar. Seu link: ${link}`, ok ? 'ok' : 'err')
  }
  const waText = `Bora treinar comigo no ${BOX.name}? 💪 Agenda tua aula experimental grátis pelo meu link: ${url}`

  return (
    <div className="rounded-2xl bg-gradient-to-br from-accent/15 to-transparent p-4 ring-1 ring-accent/40">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-ink">
          <Gift size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.25em] text-highlight">Indique e Ganhe</div>
          <h2 className="font-display text-xl font-extrabold uppercase leading-tight">Traga um amigo, ganhe {reward}</h2>
          <p className="text-[11px] text-fg-muted">de desconto na sua próxima mensalidade, por amigo matriculado</p>
        </div>
      </div>

      {/* Contador */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-card px-3 py-2.5 ring-1 ring-line">
        <span className="font-display text-2xl font-extrabold">{n}</span>
        <span className="text-xs leading-snug text-fg-soft">
          {n === 1 ? 'amigo indicado' : 'amigos indicados'}
          {r.available > 0 ? (
            <>
              {' '}
              • <b className="text-emerald-600 dark:text-emerald-300">{brl(r.available)} de desconto garantido</b> na próxima mensalidade
            </>
          ) : r.used.length ? (
            <> • desconto já usado na última mensalidade</>
          ) : (
            <> • ainda sem desconto</>
          )}
        </span>
      </div>

      {/* Link */}
      <div className="mt-3">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Seu link exclusivo</div>
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-line bg-surface/60 px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>
            {link}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={copy} className="flex items-center justify-center gap-1.5 rounded-xl bg-inverse px-3 py-2.5 text-xs font-bold text-on-inverse active:scale-[.98]">
            <Copy size={14} /> Copiar Link
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-wa-light px-3 py-2.5 text-xs font-bold text-white active:scale-[.98]"
          >
            <MessageCircle size={14} /> Enviar no WhatsApp
          </a>
        </div>
      </div>

      {/* Como funciona */}
      <div className="mt-3 rounded-xl bg-card/70 p-3 ring-1 ring-line">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Como funciona</div>
        <ol className="space-y-1 text-[11px] leading-snug text-fg-soft">
          <li>
            <b>1.</b> Seu amigo agenda a aula experimental pelo seu link.
          </li>
          <li>
            <b>2.</b> Ele <b>valida a presença</b> na aula (QR Code, GPS ou chamada do coach).
          </li>
          <li>
            <b>3.</b> Quando ele <b>fecha a matrícula</b>, o desconto de {reward} entra <b>automaticamente</b> na sua próxima mensalidade. Não precisa pedir nada.
          </li>
        </ol>
      </div>

      {/* Amigos indicados */}
      {r.friends.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {r.friends.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-card/60 px-3 py-2 text-xs">
              <span className="truncate font-medium">{f.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STAGE[f.stage].cls}`}>
                {f.stage === 'matriculado' && <Check size={9} className="mr-0.5 inline" />}
                {STAGE[f.stage].label}
              </span>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => demoReferralFriend(pid)} className="mt-3 w-full rounded-lg border border-dashed border-fuchsia-500/40 py-2 text-[11px] font-bold text-fuchsia-600 dark:text-fuchsia-300">
        Demo: simular amigo que fez a aula e se matriculou
      </button>
    </div>
  )
}
