/*
 * Treino do Dia — lançamento rápido pela equipe (coach e owner).
 * Escolhe a data e a modalidade, escreve o treino e publica. Se já existe treino
 * naquela data + modalidade, o formulário abre preenchido para editar.
 * Tabela daily_wods (migrations/20261201_treino_do_dia.sql); o RLS só deixa a equipe gravar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dumbbell, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import * as api from '../lib/api/wods'

const BOX_TZ = 'America/Sao_Paulo'
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const TITLE_MAX = 80
const DESC_MAX = 4000
const DAYS = 14 // hoje + 13 dias: dá para deixar a semana seguinte pronta

const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: BOX_TZ }).format(new Date())
function nextDays(n) {
  const [y, m, d] = todayKey().split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i))
    return { key: dt.toISOString().slice(0, 10), weekday: dt.getUTCDay(), day: dt.getUTCDate(), offset: i }
  })
}

const inputCls =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

export default function WodGestao({ box, notify }) {
  const days = useMemo(() => nextDays(DAYS), [])
  const [date, setDate] = useState(days[0].key)
  const [modality, setModality] = useState(null)
  const [mods, setMods] = useState([])
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [form, setForm] = useState({ title: '', description: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      const [m, rows] = await Promise.all([api.fetchModalities(box.id), api.fetchWods(box.id, days[0].key, days[days.length - 1].key)])
      setMods(m)
      setModality((cur) => cur ?? m[0]?.code ?? null)
      setState({ status: 'ok', rows })
    } catch (e) {
      setState({ status: 'error', rows: [], message: e.message })
    }
  }, [box.id, days])
  useEffect(() => {
    load()
  }, [load])

  const index = useMemo(() => api.indexWods(state.rows), [state.rows])
  const current = modality ? index[api.wodKey(date, modality)] : null

  // trocou data/modalidade → o formulário mostra o treino que já existe (ou fica em branco)
  useEffect(() => {
    setForm({ title: current?.title || '', description: current?.description || '' })
  }, [current?.id, current?.updated_at, date, modality]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = form.title !== (current?.title || '') || form.description !== (current?.description || '')

  const save = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !modality) return
    setBusy(true)
    const res = await api.saveWod({ boxId: box.id, date, modality, ...form })
    notify(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) setState((s) => ({ ...s, rows: [...s.rows.filter((w) => w.id !== res.data.id), res.data] }))
    setBusy(false)
  }

  const remove = async () => {
    if (!current || !window.confirm(`Remover o treino de ${modName(modality)} deste dia?`)) return
    setBusy(true)
    const res = await api.deleteWod(current.id)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) setState((s) => ({ ...s, rows: s.rows.filter((w) => w.id !== current.id) }))
    setBusy(false)
  }

  const modName = (code) => mods.find((m) => m.code === code)?.name || code
  const countOn = (key) => mods.filter((m) => index[api.wodKey(key, m.code)]).length

  if (state.status === 'loading' && !mods.length)
    return (
      <div className="flex justify-center py-12 text-fg-muted">
        <Loader2 className="animate-spin" size={22} aria-label="Carregando" />
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center text-sm text-fg-muted ring-1 ring-line">
        <RefreshCw size={24} className="text-fg-subtle" />
        {state.message}
        <button onClick={load} className="mt-1 font-semibold text-fg underline underline-offset-4">
          Tentar de novo
        </button>
      </div>
    )
  if (!mods.length)
    return (
      <div className="rounded-2xl bg-card px-6 py-10 text-center text-sm text-fg-muted ring-1 ring-line">
        Este box ainda não tem modalidades cadastradas. Cadastre as modalidades para lançar o treino do dia.
      </div>
    )

  return (
    <div>
      {/* data */}
      <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-1">
        <div className="flex gap-2" role="tablist" aria-label="Data do treino">
          {days.map((d) => {
            const n = countOn(d.key)
            const active = d.key === date
            return (
              <button
                key={d.key}
                role="tab"
                aria-selected={active}
                onClick={() => setDate(d.key)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 transition ${active ? 'bg-accent text-on-accent shadow' : 'bg-card text-fg-soft ring-1 ring-line hover:bg-elevated'}`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">{d.offset === 0 ? 'Hoje' : WEEKDAYS[d.weekday]}</span>
                <span className="font-display text-xl font-bold leading-none">{d.day}</span>
                <span className={`mt-0.5 text-[10px] font-semibold ${active ? 'text-on-accent/80' : 'text-fg-subtle'}`}>
                  {n ? `${n}/${mods.length}` : '—'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* modalidade */}
      <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Modalidade">
        {mods.map((m) => {
          const active = m.code === modality
          const has = !!index[api.wodKey(date, m.code)]
          return (
            <button
              key={m.code}
              role="radio"
              aria-checked={active}
              onClick={() => setModality(m.code)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase transition ${active ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line hover:text-fg'}`}
            >
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-fg/20" style={{ background: m.color || 'var(--color-accent)' }} aria-hidden="true" />
              {m.name}
              {has && <span aria-label="já tem treino">✓</span>}
            </button>
          )
        })}
      </div>

      <form onSubmit={save} className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <Dumbbell size={14} className="text-highlight" />
          {current ? 'Já publicado. Edite e salve para atualizar.' : 'Ainda sem treino para este dia e modalidade.'}
        </div>
        <label className="block">
          <span className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Título <span className="font-normal normal-case text-fg-subtle">{form.title.length}/{TITLE_MAX}</span>
          </span>
          <input
            className={inputCls}
            value={form.title}
            maxLength={TITLE_MAX}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder='Ex.: "Fran" • AMRAP 20'
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Treino <span className="font-normal normal-case text-fg-subtle">{form.description.length}/{DESC_MAX}</span>
          </span>
          <textarea
            className={`${inputCls} font-mono leading-relaxed`}
            rows={8}
            maxLength={DESC_MAX}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={'Aquecimento: 3 rounds\n10 air squats\n…\n\nWOD: 21-15-9\nThrusters 43/30 kg\nPull-ups'}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !dirty || !form.title.trim()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-on-accent transition hover:bg-accent-strong active:scale-[.98] disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {current ? 'Salvar alterações' : 'Publicar treino'}
          </button>
          {current && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              aria-label="Remover treino"
              className="inline-flex items-center justify-center rounded-xl px-3 text-rose-600 ring-1 ring-line hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
