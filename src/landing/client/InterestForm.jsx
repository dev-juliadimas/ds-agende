/*
 * "Tenho interesse" na página pública do box (/clientes/:slug).
 * Grava em leads via submit_lead (sem login) — supabase/migrations/20261123_painel_admin.sql.
 * O dono vê e acompanha no Painel (/clientes/:slug/painel → Interessados).
 */
import { useState } from 'react'
import { Check, Loader2, Send } from 'lucide-react'
import { submitLead } from '../../lib/api/painel'
import { maskPhone } from '../../agenda/AuthScreen'
import { Reveal, Section, SectionTitle } from '../ui'

const field =
  'w-full rounded-2xl border border-raiz/15 bg-white px-4 py-3 text-base text-raiz placeholder:text-raiz/40 outline-none transition focus:border-ambar focus:ring-2 focus:ring-ambar/30'
const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted'

export default function InterestForm({ box }) {
  const options = ['Aula experimental', ...Object.values(box.modalities).map((m) => m.label), 'Quero saber dos planos']
  const [form, setForm] = useState({ name: '', phone: '', interest: options[0], message: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return setError('Informe seu nome.')
    if (form.phone.replace(/\D/g, '').length < 10) return setError('WhatsApp inválido. Use DDD + número.')
    if (!form.consent) return setError('Marque a autorização para o box falar com você.')
    setBusy(true)
    setError('')
    const res = await submitLead({ boxId: box.boxId, ...form })
    setBusy(false)
    if (!res.ok) return setError(res.message)
    setDone(true)
  }

  return (
    <Section id="interesse" className="bg-nevoa">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_440px] lg:items-start">
        <SectionTitle
          kicker="Tenho interesse"
          title="Quer treinar com a gente?"
          text={`Deixe seu nome e WhatsApp. A equipe do ${box.name} chama você para tirar dúvidas e marcar sua aula experimental.`}
        />
        <Reveal>
          {done ? (
            <div className="flex flex-col items-center rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-raiz/10" role="status">
              <span className="flex size-12 items-center justify-center rounded-full bg-ambar text-ink">
                <Check className="size-6" aria-hidden />
              </span>
              <p className="mt-4 font-display text-2xl font-extrabold uppercase">Recebemos!</p>
              <p className="mt-2 text-muted">Em breve o box fala com você pelo WhatsApp.</p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-raiz/10 sm:p-8">
              <label className="block">
                <span className={labelCls}>Nome</span>
                <input value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" placeholder="Seu nome" className={field} maxLength={120} />
              </label>
              <label className="block">
                <span className={labelCls}>WhatsApp</span>
                <input type="tel" inputMode="tel" autoComplete="tel-national" value={form.phone} onChange={(e) => set({ phone: maskPhone(e.target.value) })} placeholder="(48) 99999-0000" className={field} />
              </label>
              <label className="block">
                <span className={labelCls}>Tenho interesse em</span>
                <select value={form.interest} onChange={(e) => set({ interest: e.target.value })} className={`${field} appearance-none`}>
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Mensagem (opcional)</span>
                <textarea value={form.message} onChange={(e) => set({ message: e.target.value })} rows={3} maxLength={500} placeholder="Ex.: melhor horário para treinar, se já treinou antes…" className={`${field} resize-none`} />
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-muted">
                <input type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-[var(--color-ambar)]" />
                <span>
                  Autorizo o {box.name} a guardar meu nome e WhatsApp para falar comigo sobre aulas e planos. Posso pedir a exclusão a qualquer momento.
                </span>
              </label>
              {error && (
                <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ambar px-6 py-3 text-[15px] font-semibold text-ink transition hover:bg-ambar-hover active:scale-[.98] disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                Quero ser chamado
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </Section>
  )
}
