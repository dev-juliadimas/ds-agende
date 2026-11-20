/*
 * Aba Perfil do aluno:
 *   • dados do plano
 *   • horários fixos (useRecurring.js · migrations/20261130_horario_fixo.sql)
 *     Desativar para as próximas reservas automáticas; o que já foi reservado
 *     continua na Agenda (o aluno cancela lá, se quiser).
 *   • card "Indique um amigo" (IndiqueAmigo.jsx · migrations/20261130_indique_ganhe.sql)
 */
import { useState } from 'react'
import { Loader2, Pin } from 'lucide-react'
import * as api from '../lib/api/agenda'
import IndiqueAmigo from './IndiqueAmigo'

const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function Perfil({ box, slug, me, memberLabel, recurring, notify }) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="font-display text-lg font-bold uppercase leading-tight">{me.name}</div>
        <div className="mt-0.5 text-sm text-fg-muted">{memberLabel}</div>
      </div>
      {recurring.enabled && <HorariosFixos recurring={recurring} notify={notify} />}
      <IndiqueAmigo box={box} slug={slug} notify={notify} />
    </section>
  )
}

function HorariosFixos({ recurring, notify }) {
  const [confirm, setConfirm] = useState(null) // id aguardando confirmação
  const [busy, setBusy] = useState(null)
  const { active, status } = recurring

  const unfix = async (rb) => {
    setBusy(rb.id)
    const res = await api.unfixSlot({ recurringId: rb.id })
    notify(res.message, res.ok ? 'ok' : 'err')
    await recurring.reload()
    setBusy(null)
    setConfirm(null)
  }

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <h2 className="flex items-center gap-1.5 font-display text-base font-bold uppercase">
        <Pin size={14} /> Horários fixos
      </h2>
      <p className="mt-1 text-xs text-fg-muted">
        Reservamos sua vaga nesses horários toda semana, enquanto seu plano estiver em dia. Se a turma lotar, você não entra
        automaticamente naquela aula.
      </p>

      {status === 'loading' && (
        <div className="mt-4 flex justify-center text-fg-subtle">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <button onClick={recurring.reload} className="mt-3 text-sm font-semibold text-accent-strong hover:underline">
          Não foi possível carregar. Tentar de novo
        </button>
      )}
      {status === 'ready' && active.length === 0 && (
        <p className="mt-3 rounded-xl bg-elevated p-3 text-sm text-fg-muted">
          Nenhum horário fixo ainda. Na Agenda, toque em “Fixar este horário toda semana” no card da aula.
        </p>
      )}

      {active.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {active.map((rb) => (
            <li key={rb.id} className="flex items-center gap-3 py-2.5">
              <span className="h-8 w-1.5 shrink-0 rounded-full ring-1 ring-inset ring-fg/15" style={{ backgroundColor: rb.modality_color || 'var(--color-accent)' }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {WEEKDAY_FULL[rb.weekday]} · {rb.start_time}
                </div>
                <div className="truncate text-xs text-fg-muted">
                  {[rb.label || rb.modality_name, rb.coach_name].filter(Boolean).join(' · ') || 'Aula'}
                  {!rb.slot_active && ' · turma fora da grade'}
                </div>
              </div>
              {confirm === rb.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => unfix(rb)}
                    disabled={busy != null}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-500/30 disabled:opacity-50 dark:text-rose-300"
                  >
                    {busy === rb.id && <Loader2 size={12} className="animate-spin" />} Desativar
                  </button>
                  <button onClick={() => setConfirm(null)} disabled={busy != null} className="rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:text-fg">
                    Voltar
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirm(rb.id)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-fg-muted ring-1 ring-line hover:text-fg">
                  Desativar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
