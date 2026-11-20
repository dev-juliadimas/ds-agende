/*
 * Etapa 3 do auto-cadastro: anamnese (PAR-Q) + Termo de Responsabilidade e LGPD.
 * As respostas vão só para health_forms (dado sensível, LGPD art. 11): o aluno grava,
 * apenas coach/gestor do box leem. Nada daqui vai para o user_metadata.
 */
import { useState } from 'react'
import { ChevronDown, HeartPulse, ShieldCheck } from 'lucide-react'
import { input } from '../AuthScreen'

export const QUESTIONS = [
  { key: 'has_heart_condition', info: 'heart_condition_info', text: 'Algum médico já disse que você possui problema cardíaco ou pressão alta?' },
  { key: 'has_chest_pain', info: 'chest_pain_info', text: 'Sente dor no peito ao praticar atividade física?' },
  { key: 'had_dizziness', info: 'dizziness_info', text: 'Teve tontura, desmaio ou perda de consciência nos últimos 12 meses?' },
  { key: 'has_injury', info: 'injury_info', text: 'Possui alguma lesão, dor articular/óssea ou cirurgia recente que limite movimentos?' },
  { key: 'uses_medication', info: 'medication_info', text: 'Faz uso contínuo de algum medicamento?' },
]

export const EMPTY_HEALTH = Object.fromEntries([
  ...QUESTIONS.flatMap((q) => [
    [q.key, null],
    [q.info, ''],
  ]),
  ['coach_notes', ''],
])

export const healthIsComplete = (h) => QUESTIONS.every((q) => typeof h[q.key] === 'boolean')

function YesNo({ value, onChange, name }) {
  const opt = (v, label) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      name={name}
      onClick={() => onChange(v)}
      className={`min-h-11 flex-1 rounded-lg text-sm font-bold transition ${
        value === v ? (v ? 'bg-accent text-on-accent shadow-sm' : 'bg-inverse text-on-inverse shadow-sm') : 'text-fg-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div role="radiogroup" className="flex w-32 shrink-0 gap-1 rounded-xl bg-elevated p-1 ring-1 ring-line">
      {opt(false, 'Não')}
      {opt(true, 'Sim')}
    </div>
  )
}

function Term({ box }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl bg-elevated text-sm ring-1 ring-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 font-semibold">
        Ler o termo completo
        <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 pb-3 pt-2 text-xs leading-relaxed text-fg-muted">
          <p>
            <b className="text-fg">Responsabilidade.</b> Declaro que as informações de saúde acima são verdadeiras e que vou avisar o coach sobre
            qualquer mudança. Entendo que o treino funcional/CrossFit envolve esforço físico intenso e que, se respondi “Sim” a alguma pergunta,
            devo buscar avaliação médica antes de treinar.
          </p>
          <p>
            <b className="text-fg">Dados de saúde (LGPD, art. 11).</b> Autorizo o {box.name} a guardar estas respostas para adaptar os treinos e
            agir em caso de emergência. Elas ficam visíveis apenas para os coaches e gestores do box, não são compartilhadas com terceiros e não
            são usadas para marketing.
          </p>
          <p>
            <b className="text-fg">Seus direitos.</b> Você pode pedir a qualquer momento acesso, correção ou exclusão destes dados, ou retirar este
            consentimento, falando com a recepção do box. Sem a ficha de saúde não é possível treinar no box.
          </p>
        </div>
      )}
    </div>
  )
}

export default function HealthStep({ box, health, consent, onHealth, onConsent }) {
  // onHealth recebe uma função (estado anterior → novo): toques rápidos não se sobrescrevem
  const set = (patch) => onHealth((h) => ({ ...h, ...patch }))
  const anyYes = QUESTIONS.some((q) => health[q.key] === true)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl bg-card p-3 text-sm text-fg-muted ring-1 ring-line">
        <HeartPulse size={18} className="mt-0.5 shrink-0 text-highlight" />
        <p>Ficha rápida de saúde (PAR-Q). Só o coach vê, para adaptar o treino a você.</p>
      </div>

      <ol className="space-y-3">
        {QUESTIONS.map((q, i) => (
          <li key={q.key} className="rounded-2xl bg-card p-4 ring-1 ring-line">
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                <span className="mr-1 font-display font-bold text-highlight">{i + 1}.</span>
                {q.text}
              </span>
              <YesNo name={q.key} value={health[q.key]} onChange={(v) => set({ [q.key]: v, ...(v ? {} : { [q.info]: '' }) })} />
            </div>
            {health[q.key] === true && (
              <textarea
                value={health[q.info]}
                onChange={(e) => set({ [q.info]: e.target.value })}
                maxLength={500}
                rows={2}
                placeholder="Detalhes (opcional): o quê, desde quando, liberação médica…"
                aria-label={`Detalhes: ${q.text}`}
                className={`${input} mt-3 resize-none text-sm`}
              />
            )}
          </li>
        ))}
      </ol>

      {anyYes && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          Tudo bem treinar com alguma condição. Recomendamos liberação médica e o coach vai olhar sua ficha antes do primeiro treino.
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">Alguma observação importante para o coach?</span>
        <textarea
          value={health.coach_notes}
          onChange={(e) => set({ coach_notes: e.target.value })}
          maxLength={1000}
          rows={3}
          placeholder="Opcional. Ex.: gestante, asma, objetivo do treino…"
          className={`${input} resize-none text-sm`}
        />
      </label>

      <Term box={box} />

      <label className={`flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition ${consent ? 'bg-card ring-2 ring-accent' : 'bg-card ring-1 ring-line'}`}>
        <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
        <span className="text-sm leading-snug">
          <span className="flex items-center gap-1.5 font-semibold">
            <ShieldCheck size={15} className="text-highlight" /> Li e aceito o Termo de Responsabilidade
          </span>
          <span className="mt-0.5 block text-fg-muted">e autorizo o armazenamento dos meus dados de saúde pelo {box.name}, conforme a LGPD.</span>
        </span>
      </label>
    </div>
  )
}
