/*
 * Feriados e aulas especiais — Painel do administrador → Turmas.
 * Botão "Gerenciar data especial / Feriado" + modal com a lista de datas, o formulário
 * da data e o da aula avulsa. A grade fixa (schedule_slots) não muda: tudo é por data.
 * Regras no banco: supabase/migrations/20261130_feriados_aulas_especiais.sql.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CalendarClock, CalendarOff, CalendarPlus, Loader2, PartyPopper, Pencil, Plus, Trash2 } from 'lucide-react'
import * as api from '../lib/api/painel'
import { Modal } from '../avisos/shared'
import { Chip } from './parts'

const BOX_TZ = 'America/Sao_Paulo'
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: BOX_TZ }).format(new Date())
const fmtDay = (d) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${d}T12:00:00Z`))
const LEVELS = [
  ['misto', 'Misto'],
  ['iniciante', 'Iniciante'],
  ['scaled', 'Scaled'],
  ['rx', 'RX'],
]
const inputCls =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wider text-fg-muted">
        {label} {hint && <span className="font-normal normal-case text-fg-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

const primaryBtn =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-on-accent transition hover:bg-accent-strong active:scale-[.98] disabled:opacity-60'

/** Botão da aba Turmas. staff = pessoas do box com papel coach/owner ({ person_id, name }). */
export function SpecialDaysButton({ box, staff, notify, onChanged }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-line transition hover:ring-line-strong"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-highlight">
          <CalendarClock size={18} />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <b className="block text-fg">Gerenciar data especial / Feriado</b>
          <span className="text-xs text-fg-muted">Cancele a grade de um dia ou crie uma aula avulsa, sem mexer nos horários fixos.</span>
        </span>
      </button>
      {open && <SpecialDaysModal box={box} staff={staff} notify={notify} onChanged={onChanged} onClose={() => setOpen(false)} />}
    </>
  )
}

function SpecialDaysModal({ box, staff, notify, onChanged, onClose }) {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  // list | { mode: 'day', day? } | { mode: 'session', day }
  const [view, setView] = useState('list')
  const [busy, setBusy] = useState(null)
  const [modalities, setModalities] = useState([])

  const load = useCallback(async () => {
    try {
      setState({ status: 'ok', rows: await api.fetchSpecialDays(box.id) })
    } catch (e) {
      setState({ status: 'error', rows: [], message: e.message })
    }
  }, [box.id])
  useEffect(() => {
    load()
    api.fetchModalities(box.id).then(setModalities, () => {})
  }, [load, box.id])

  const done = async (res) => {
    notify(res.message, res.ok ? 'ok' : 'err')
    if (!res.ok) return false
    await load()
    onChanged?.()
    return true
  }

  const removeDay = async (row) => {
    if (!window.confirm(`Tirar a marcação de ${fmtDay(row.day)}?${row.kind === 'feriado' ? ' As aulas da grade desse dia voltam a abrir (reservas desfeitas não voltam).' : ''}`)) return
    setBusy(`day:${row.day}`)
    await done(await api.removeSpecialDay({ boxId: box.id, day: row.day }))
    setBusy(null)
  }

  const removeSession = async (s) => {
    if (!window.confirm(`Remover "${s.label}" às ${s.start_time}?${s.booked_count ? ` ${s.booked_count} reserva(s) serão desfeitas.` : ''}`)) return
    setBusy(`s:${s.session_id}`)
    await done(await api.cancelSpecialSession({ sessionId: s.session_id }))
    setBusy(null)
  }

  if (view !== 'list') {
    const back = () => setView('list')
    const row = state.rows.find((r) => r.day === view.day)
    return view.mode === 'day' ? (
      <DayForm box={box} row={row} onBack={back} onClose={onClose} onSaved={async (res) => (await done(res)) && back()} />
    ) : (
      <SessionForm
        box={box}
        day={view.day}
        holiday={row?.kind === 'feriado' ? row.title : null}
        staff={staff}
        modalities={modalities}
        onBack={back}
        onClose={onClose}
        onSaved={async (res) => (await done(res)) && back()}
      />
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Datas especiais"
      footer={
        <button onClick={() => setView({ mode: 'day' })} className={primaryBtn}>
          <CalendarPlus size={16} /> Marcar data
        </button>
      }
    >
      {state.status === 'loading' && (
        <div className="flex justify-center py-10 text-fg-muted">
          <Loader2 className="animate-spin" size={22} aria-label="Carregando" />
        </div>
      )}
      {state.status === 'error' && <p className="py-6 text-center text-sm text-fg-muted">Não foi possível carregar. {state.message}</p>}
      {state.status === 'ok' && !state.rows.length && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-fg-muted">
          <CalendarOff size={24} className="text-fg-subtle" />
          Nenhum feriado ou data especial marcado.
          <span className="text-xs text-fg-subtle">Marque um feriado para cancelar as aulas da grade do dia e, se quiser, crie um aulão no lugar.</span>
        </div>
      )}
      {state.status === 'ok' && state.rows.length > 0 && (
        <ul className="space-y-3">
          {state.rows.map((r) => (
            <li key={r.day} className="rounded-2xl bg-card p-3 ring-1 ring-line">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{fmtDay(r.day)}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <b className="truncate text-sm text-fg">{r.title || 'Aula avulsa'}</b>
                    {r.kind === 'feriado' && <Chip tone="err">Feriado</Chip>}
                    {r.kind === 'especial' && <Chip tone="info">Data especial</Chip>}
                  </div>
                  {r.kind === 'feriado' && (
                    <p className="mt-1 text-xs text-fg-muted">
                      {r.cancelled_sessions} aula{r.cancelled_sessions === 1 ? '' : 's'} da grade cancelada{r.cancelled_sessions === 1 ? '' : 's'}
                      {r.regular_sessions > 0 ? ` · ${r.regular_sessions} ainda ativa${r.regular_sessions === 1 ? '' : 's'} (já começaram ou encerradas)` : ''}
                    </p>
                  )}
                  {r.note && <p className="mt-1 text-xs text-fg-muted">{r.note}</p>}
                </div>
                {r.kind && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setView({ mode: 'day', day: r.day })} aria-label="Editar data" className="rounded-lg p-2 text-fg-muted hover:bg-elevated hover:text-fg">
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => removeDay(r)}
                      disabled={busy != null}
                      aria-label="Tirar marcação"
                      className="rounded-lg p-2 text-fg-muted hover:bg-elevated hover:text-rose-600 disabled:opacity-50"
                    >
                      {busy === `day:${r.day}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                )}
              </div>

              {r.sessions.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {r.sessions.map((s) => (
                    <li key={s.session_id} className={`flex items-center gap-2 rounded-xl bg-elevated/60 px-3 py-2 ring-1 ring-line ${s.cancelled ? 'opacity-60' : ''}`}>
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: s.modality_color || 'var(--color-accent)' }} />
                      <span className="font-display text-lg font-bold leading-none">{s.start_time}</span>
                      <span className="min-w-0 flex-1 text-xs">
                        <b className="block truncate text-sm text-fg">{s.label}</b>
                        <span className="text-fg-muted">
                          {s.duration_min} min · {s.booked_count}/{s.capacity} vagas{s.coach_name ? ` · ${s.coach_name}` : ''}
                        </span>
                      </span>
                      {s.cancelled ? (
                        <Chip tone="err">Cancelada</Chip>
                      ) : (
                        <button
                          onClick={() => removeSession(s)}
                          disabled={busy != null}
                          aria-label="Remover aula especial"
                          className="rounded-lg p-1.5 text-fg-muted hover:bg-card hover:text-rose-600 disabled:opacity-50"
                        >
                          {busy === `s:${s.session_id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={() => setView({ mode: 'session', day: r.day })}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-highlight hover:bg-elevated"
              >
                <Plus size={14} /> Aula especial neste dia
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function BackTitle({ onBack, children }) {
  return (
    <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-soft hover:text-fg">
      <ArrowLeft size={14} /> {children}
    </button>
  )
}

function DayForm({ box, row, onBack, onClose, onSaved }) {
  const editing = !!row?.kind
  const [f, setF] = useState(() => ({
    day: row?.day || '',
    kind: row?.kind || 'feriado',
    title: row?.title || 'Feriado Nacional',
    note: row?.note || '',
  }))
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    const res = await api.setSpecialDay({ boxId: box.id, ...f })
    setSaving(false)
    onSaved(res)
  }

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={editing ? 'Editar data' : 'Marcar data'}
      footer={
        <button type="submit" form="special-day-form" disabled={saving || !f.day} className={primaryBtn}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : f.kind === 'feriado' ? <CalendarOff size={16} /> : <PartyPopper size={16} />}
          {f.kind === 'feriado' ? 'Salvar feriado' : 'Salvar data especial'}
        </button>
      }
    >
      <BackTitle onBack={onBack}>Datas especiais</BackTitle>
      <form id="special-day-form" onSubmit={save} className="space-y-4">
        <Field label="Data">
          <input type="date" className={inputCls} value={f.day} min={todayKey()} onChange={set('day')} disabled={editing} required />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">Tipo</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['feriado', 'Feriado', CalendarOff],
              ['especial', 'Data especial', PartyPopper],
            ].map(([k, l, Icon]) => (
              <button
                key={k}
                type="button"
                aria-pressed={f.kind === k}
                onClick={() => setF((x) => ({ ...x, kind: k, title: x.title === 'Feriado Nacional' && k === 'especial' ? '' : x.title }))}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition ${
                  f.kind === k ? 'bg-accent/15 text-fg ring-2 ring-accent' : 'bg-card text-fg-muted ring-line hover:text-fg'
                }`}
              >
                <Icon size={15} /> {l}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            {f.kind === 'feriado'
              ? 'Todas as aulas da grade fixa deste dia serão canceladas com este motivo. Reservas e lista de espera do dia são desfeitas.'
              : 'Só destaca o dia na agenda. As aulas da grade continuam normais.'}
          </p>
        </fieldset>

        <Field label="Título" hint={`${f.title.length}/60`}>
          <input className={inputCls} value={f.title} maxLength={60} onChange={set('title')} placeholder="Ex.: Feriado Nacional" required />
        </Field>

        <Field label="Recado para os alunos" hint={`opcional · ${f.note.length}/280`}>
          <textarea className={inputCls} rows={2} maxLength={280} value={f.note} onChange={set('note')} placeholder="Ex.: Bom descanso! Voltamos na sexta às 06:00." />
        </Field>
      </form>
    </Modal>
  )
}

function SessionForm({ box, day, holiday, staff, modalities, onBack, onClose, onSaved }) {
  const [f, setF] = useState({
    day: day || '',
    time: '09:00',
    label: holiday ? 'Aulão de Feriado' : 'Aula especial',
    duration: 60,
    capacity: 20,
    modalityId: '',
    coachId: '',
    level: 'misto',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    const res = await api.createSpecialSession({ boxId: box.id, ...f })
    setSaving(false)
    onSaved(res)
  }

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Aula especial"
      footer={
        <button type="submit" form="special-session-form" disabled={saving} className={primaryBtn}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar aula
        </button>
      }
    >
      <BackTitle onBack={onBack}>Datas especiais</BackTitle>
      <p className="mb-4 text-xs text-fg-muted">
        Aula só desta data{holiday ? ` (${holiday})` : ''}. Não entra na grade fixa. Reserva, lista de espera e check-in funcionam como nas outras aulas.
      </p>
      <form id="special-session-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input type="date" className={inputCls} value={f.day} min={todayKey()} onChange={set('day')} required />
          </Field>
          <Field label="Horário">
            <input type="time" className={inputCls} value={f.time} onChange={set('time')} required />
          </Field>
        </div>
        <Field label="Nome da aula" hint={`${f.label.length}/60`}>
          <input className={inputCls} value={f.label} maxLength={60} onChange={set('label')} placeholder="Ex.: Aulão de Feriado" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duração (min)">
            <input type="number" inputMode="numeric" min={15} max={240} step={5} className={inputCls} value={f.duration} onChange={set('duration')} required />
          </Field>
          <Field label="Vagas">
            <input type="number" inputMode="numeric" min={1} max={200} className={inputCls} value={f.capacity} onChange={set('capacity')} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modalidade">
            <select className={inputCls} value={f.modalityId} onChange={set('modalityId')}>
              <option value="">Sem modalidade</option>
              {modalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nível">
            <select className={inputCls} value={f.level} onChange={set('level')}>
              {LEVELS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Coach">
          <select className={inputCls} value={f.coachId} onChange={set('coachId')}>
            <option value="">A definir</option>
            {staff.map((p) => (
              <option key={p.person_id} value={p.person_id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  )
}
