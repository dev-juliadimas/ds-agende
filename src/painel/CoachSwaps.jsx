/*
 * Coach responsável por aula + trocas entre coaches (migrations/20261207_coach_por_aula_e_trocas.sql)
 *
 *   • SwapInbox     → pedidos de troca pendentes no topo de "Turmas" (aceitar / recusar / cancelar)
 *   • CoachControl  → dentro de cada aula:
 *        administrador: escolhe o coach desta data ou o coach fixo da turma (sem pedido)
 *        coach da aula: pede para outro coach assumir (só esta data ou a turma toda semana);
 *                       a aula só muda quando o outro coach aceitar
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Check, Loader2, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import * as api from '../lib/api/painel'
import { Modal } from '../avisos/shared'
import { Chip } from './parts'

const BOX_TZ = 'America/Sao_Paulo'
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const fmtDay = (ts) => new Intl.DateTimeFormat('pt-BR', { timeZone: BOX_TZ, day: '2-digit', month: '2-digit' }).format(new Date(ts))
const SCOPE = { aula: 'só esta data', turma: 'toda semana' }

const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50'
const selectCls = 'w-full rounded-xl bg-elevated px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-accent'

/** Pedidos de troca; recarrega sozinho quando algum pedido do box muda (Realtime). */
export function useCoachSwaps(boxId, onChange) {
  const [rows, setRows] = useState([])
  const load = useCallback(async () => {
    try {
      setRows(await api.fetchCoachSwaps(boxId))
    } catch {
      setRows([]) // migration ainda não rodada: a caixa só não aparece
    }
  }, [boxId])
  useEffect(() => {
    load()
    if (!supabase) return
    const ch = supabase
      .channel(`coach_swaps:${boxId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_swaps', filter: `box_id=eq.${boxId}` }, () => {
        load()
        onChange?.()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [boxId, load]) // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, reload: load }
}

/** Caixa de pedidos pendentes (coach: os dele; administrador: todos). */
export function SwapInbox({ swaps, isOwner, notify, onChanged }) {
  const [busy, setBusy] = useState(null)
  const pending = swaps.filter((w) => w.status === 'pendente' && !w.expired)
  if (!pending.length) return null

  const act = async (id, fn) => {
    setBusy(id)
    const res = await fn()
    notify(res.message, res.ok ? 'ok' : 'err')
    setBusy(null)
    onChanged()
  }

  return (
    <section aria-label="Pedidos de troca" className="mb-3 space-y-2 rounded-2xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200">
        <ArrowLeftRight size={14} /> Trocas de aula pendentes · {pending.length}
      </h3>
      <ul className="space-y-2">
        {pending.map((w) => {
          const when = `${WEEKDAYS[w.weekday]} ${fmtDay(w.starts_at)} · ${w.start_time} · ${w.class_name}`
          return (
            <li key={w.swap_id} className="rounded-xl bg-card p-3 text-sm ring-1 ring-line">
              <p className="font-semibold">{when}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {w.incoming ? (
                  <>
                    <b className="text-fg">{w.from_name}</b> pediu para você assumir ({SCOPE[w.scope]})
                  </>
                ) : w.outgoing ? (
                  <>
                    Aguardando <b className="text-fg">{w.to_name}</b> aceitar ({SCOPE[w.scope]})
                  </>
                ) : (
                  <>
                    {w.from_name} → {w.to_name} ({SCOPE[w.scope]})
                  </>
                )}
              </p>
              {w.note && <p className="mt-1 rounded-lg bg-elevated px-2 py-1 text-xs italic text-fg-soft">“{w.note}”</p>}
              <div className="mt-2 flex gap-2">
                {w.incoming && (
                  <>
                    <button
                      disabled={busy === w.swap_id}
                      onClick={() => act(w.swap_id, () => api.respondSwap({ swapId: w.swap_id, accept: true }))}
                      className={`${btn} flex-1 bg-accent text-on-accent hover:bg-accent-strong`}
                    >
                      {busy === w.swap_id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aceitar
                    </button>
                    <button
                      disabled={busy === w.swap_id}
                      onClick={() => act(w.swap_id, () => api.respondSwap({ swapId: w.swap_id, accept: false }))}
                      className={`${btn} flex-1 bg-card text-fg ring-1 ring-line hover:bg-elevated`}
                    >
                      <X size={14} /> Recusar
                    </button>
                  </>
                )}
                {!w.incoming && (w.outgoing || isOwner) && (
                  <button
                    disabled={busy === w.swap_id}
                    onClick={() => act(w.swap_id, () => api.cancelSwap({ swapId: w.swap_id }))}
                    className={`${btn} bg-card text-fg-soft ring-1 ring-line hover:text-fg`}
                  >
                    Cancelar pedido
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Pedido de troca PARA quem está logado: abre na frente assim que entra no painel
 * (em qualquer aba) e também quando chega um pedido novo com o painel aberto (Realtime).
 * "Ver depois" esconde até chegar outro pedido; os pendentes continuam no topo de Turmas.
 */
export function IncomingSwapsPrompt({ box, notify }) {
  const swaps = useCoachSwaps(box.id)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const incoming = swaps.rows.filter((w) => w.incoming && w.status === 'pendente' && !w.expired)
  const fresh = incoming.filter((w) => !dismissed.has(w.swap_id))
  if (!fresh.length) return null

  const answer = async (w, accept) => {
    setBusy(w.swap_id)
    const res = await api.respondSwap({ swapId: w.swap_id, accept })
    notify(res.message, res.ok ? 'ok' : 'err')
    setBusy(null)
    swaps.reload()
  }

  return (
    <Modal
      open
      onClose={() => setDismissed(new Set(incoming.map((w) => w.swap_id)))}
      title={fresh.length > 1 ? `${fresh.length} pedidos de troca` : 'Pedido de troca de aula'}
      footer={
        <button onClick={() => setDismissed(new Set(incoming.map((w) => w.swap_id)))} className={`${btn} w-full bg-card py-2.5 text-sm text-fg ring-1 ring-line hover:bg-elevated`}>
          Ver depois
        </button>
      }
    >
      <ul className="space-y-3">
        {fresh.map((w) => (
          <li key={w.swap_id} className="rounded-2xl bg-elevated/60 p-3 text-sm ring-1 ring-line">
            <p>
              <b>{w.from_name}</b> pediu para você assumir a aula:
            </p>
            <p className="mt-1 font-display text-lg font-bold uppercase leading-tight">
              {WEEKDAYS[w.weekday]} {fmtDay(w.starts_at)} · {w.start_time}
            </p>
            <p className="text-xs text-fg-muted">
              {w.class_name} · {w.scope === 'turma' ? 'toda semana (vira o coach fixo da turma)' : 'só esta data'}
            </p>
            {w.note && <p className="mt-2 rounded-lg bg-card px-2 py-1 text-xs italic text-fg-soft">“{w.note}”</p>}
            <div className="mt-3 flex gap-2">
              <button disabled={busy === w.swap_id} onClick={() => answer(w, true)} className={`${btn} flex-1 bg-accent py-2.5 text-on-accent hover:bg-accent-strong`}>
                {busy === w.swap_id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aceitar
              </button>
              <button disabled={busy === w.swap_id} onClick={() => answer(w, false)} className={`${btn} flex-1 bg-card py-2.5 text-fg ring-1 ring-line hover:bg-elevated`}>
                <X size={14} /> Recusar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function ScopePicker({ value, onChange, allowTurma, turmaHint }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-xs font-semibold text-fg-muted">Vale para</legend>
      {[
        ['aula', 'Só esta data', 'As outras semanas continuam como estão.'],
        ['turma', 'Toda semana (turma fixa)', turmaHint],
      ].map(([k, label, hint]) => {
        const disabled = k === 'turma' && !allowTurma
        return (
          <label key={k} className={`flex items-start gap-2 rounded-xl p-2.5 ring-1 ${value === k ? 'bg-accent/10 ring-2 ring-accent' : 'ring-line'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
            <input type="radio" name="scope" checked={value === k} disabled={disabled} onChange={() => onChange(k)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
            <span className="text-sm">
              <b className="block">{label}</b>
              <span className="text-xs text-fg-subtle">{hint}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/** Dentro do card da aula: quem dá a aula e como trocar. */
export function CoachControl({ s, isOwner, coaches, meId, notify, onChanged }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const started = new Date(s.starts_at).getTime() <= Date.now()
  const canAct = !started && !s.cancelled
  const pend = s.pending_swap

  const run = async (fn) => {
    setBusy(true)
    const res = await fn()
    notify(res.message, res.ok ? 'ok' : 'err')
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      onChanged()
    }
  }

  const who = (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
      <UserRound size={13} className="text-highlight" />
      {s.coach_name ? (
        <>
          Coach: <b className="text-fg">{s.coach_name}</b>
          {s.fixed_coach_id && s.coach_id !== s.fixed_coach_id && <span>(substituindo {s.fixed_coach_name || 'turma sem coach fixo'})</span>}
        </>
      ) : (
        <Chip tone="err">Aula sem coach</Chip>
      )}
    </p>
  )

  // ---- administrador: troca direta ----
  if (isOwner) {
    return (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-elevated/60 px-3 py-2 ring-1 ring-line">
        {who}
        {canAct && (
          <button onClick={() => setOpen(true)} className={`${btn} bg-card text-fg ring-1 ring-line hover:bg-elevated`}>
            <ArrowLeftRight size={13} /> {s.coach_id ? 'Trocar coach' : 'Definir coach'}
          </button>
        )}
        {open && (
          <OwnerModal s={s} coaches={coaches} busy={busy} onClose={() => setOpen(false)} onSave={(coachId, scope) =>
            run(() => (scope === 'turma' ? api.setSlotCoach({ slotId: s.slot_id, coachId }) : api.setSessionCoach({ sessionId: s.session_id, coachId })))
          } />
        )}
      </div>
    )
  }

  // ---- coach ----
  const mine = s.is_mine
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-elevated/60 px-3 py-2 ring-1 ring-line">
      {who}
      {pend && (pend.from === meId || pend.to === meId) && (
        <Chip tone="warn">{pend.from === meId ? `Aguardando ${pend.to_name} aceitar` : `${pend.from_name} pediu troca com você`}</Chip>
      )}
      {mine && canAct && !pend && (
        <button onClick={() => setOpen(true)} className={`${btn} bg-card text-fg ring-1 ring-line hover:bg-elevated`}>
          <ArrowLeftRight size={13} /> Passar para outro coach
        </button>
      )}
      {open && (
        <RequestModal s={s} coaches={coaches.filter((c) => c.person_id !== meId)} busy={busy} onClose={() => setOpen(false)} onSend={(toCoachId, scope, note) =>
          run(() => api.requestSwap({ sessionId: s.session_id, toCoachId, scope, note }))
        } />
      )}
    </div>
  )
}

function classTitle(s) {
  const [, m, d] = String(s.day).split('-')
  return `${d}/${m} · ${s.start_time} · ${s.label || s.modality_name || 'Aula'}`
}

function OwnerModal({ s, coaches, busy, onClose, onSave }) {
  const [coach, setCoach] = useState(s.coach_id || '')
  const [scope, setScope] = useState(s.slot_id && !s.fixed_coach_id ? 'turma' : 'aula')
  return (
    <Modal
      open
      onClose={onClose}
      title="Coach da aula"
      footer={
        <button disabled={!coach || busy} onClick={() => onSave(coach, scope)} className={`${btn} w-full bg-accent py-2.5 text-sm text-on-accent hover:bg-accent-strong`}>
          {busy && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="font-semibold">{classTitle(s)}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-fg-muted">Coach</span>
          <select value={coach} onChange={(e) => setCoach(e.target.value)} className={selectCls}>
            <option value="">Escolha…</option>
            {coaches.map((c) => (
              <option key={c.person_id} value={c.person_id}>
                {c.name}
                {c.role === 'owner' ? ' (administrador)' : ''}
              </option>
            ))}
          </select>
        </label>
        <ScopePicker
          value={scope}
          onChange={setScope}
          allowTurma={!!s.slot_id}
          turmaHint={s.slot_id ? `Vira o coach fixo desta turma${s.fixed_coach_name ? ` (hoje: ${s.fixed_coach_name})` : ''}.` : 'Aula especial: não tem turma fixa.'}
        />
      </div>
    </Modal>
  )
}

function RequestModal({ s, coaches, busy, onClose, onSend }) {
  const [coach, setCoach] = useState('')
  const [scope, setScope] = useState('aula')
  const [note, setNote] = useState('')
  const allowTurma = !!s.slot_id && s.is_fixed_mine
  return (
    <Modal
      open
      onClose={onClose}
      title="Passar a aula"
      footer={
        <button disabled={!coach || busy} onClick={() => onSend(coach, scope, note)} className={`${btn} w-full bg-accent py-2.5 text-sm text-on-accent hover:bg-accent-strong`}>
          {busy && <Loader2 size={14} className="animate-spin" />} Enviar pedido
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="font-semibold">{classTitle(s)}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-fg-muted">Para qual coach?</span>
          <select value={coach} onChange={(e) => setCoach(e.target.value)} className={selectCls}>
            <option value="">Escolha…</option>
            {coaches.map((c) => (
              <option key={c.person_id} value={c.person_id}>
                {c.name}
                {c.role === 'owner' ? ' (administrador)' : ''}
              </option>
            ))}
          </select>
        </label>
        <ScopePicker
          value={scope}
          onChange={setScope}
          allowTurma={allowTurma}
          turmaHint={allowTurma ? 'Você deixa de ser o coach fixo desta turma.' : 'Só o coach fixo da turma pode passar a turma toda semana.'}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-fg-muted">Recado (opcional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder="Ex.: tenho consulta médica nesse horário" className={selectCls} />
        </label>
        <p className="text-xs text-fg-subtle">A aula continua sua até o outro coach aceitar.</p>
      </div>
    </Modal>
  )
}
