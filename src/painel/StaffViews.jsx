/*
 * Visões da equipe no Painel (migrations/20261124_painel_coach.sql):
 *   • Turmas            → aulas dos próximos dias com a lista de quem vai (coach e owner)
 *   • CoachDashboard    → painel do coach: Minhas turmas · Treino · Aniversariantes · Aula experimental · Avisos
 * O coach não vê financeiro nem telefone. Ficha de saúde: RLS de health_forms (equipe).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarHeart, CalendarX2, Cake, ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, Sparkles, Users } from 'lucide-react'
import * as api from '../lib/api/painel'
import { Chip, HealthForm, fmtDate } from './parts'
import AvisosGestao from './AvisosGestao'
import WodGestao from './WodGestao'
import { useNotices } from '../avisos/shared'
import { CoachControl, SwapInbox, useCoachSwaps } from './CoachSwaps'

const BOX_TZ = 'America/Sao_Paulo'
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const LEVEL = { misto: 'Misto', iniciante: 'Iniciante', scaled: 'Scaled', rx: 'RX' }
const STATUS = { reservado: ['info', 'Reservado'], presente: ['ok', 'Presente'], pre_reserva: ['warn', 'Aguardando pgto'], falta: ['err', 'Faltou'], abonada: ['muted', 'Abonada'] }

const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: BOX_TZ }).format(new Date())
const fmtDateTime = (ts) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: BOX_TZ, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))

function nextDays(n) {
  const [y, m, d] = todayKey().split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i))
    return { key: dt.toISOString().slice(0, 10), weekday: dt.getUTCDay(), day: dt.getUTCDate(), offset: i }
  })
}

export function Empty({ icon: Icon = Users, children }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center text-sm text-fg-muted ring-1 ring-line">
      <Icon size={24} className="text-fg-subtle" />
      {children}
    </div>
  )
}

const Center = () => (
  <div className="flex justify-center py-12 text-fg-muted">
    <Loader2 className="animate-spin" size={22} aria-label="Carregando" />
  </div>
)

/** Pessoa com a ficha de saúde ao tocar (sem telefone nem financeiro). */
function PersonLine({ p, children, tags }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-xl bg-elevated/60 ring-1 ring-line">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{p.name}</span>
            {p.health_attention && <AlertTriangle size={13} className="shrink-0 text-amber-600 dark:text-amber-300" aria-label="Atenção na ficha de saúde" />}
            {p.birthday_today && <Cake size={13} className="shrink-0 text-highlight" aria-label="Aniversário hoje" />}
          </span>
          {tags && <span className="mt-0.5 flex flex-wrap gap-1">{tags}</span>}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-fg-subtle transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 pb-3 pt-2">
          {children}
          <HealthForm personId={p.person_id} />
        </div>
      )}
    </li>
  )
}

function SessionCard({ s, coachCtl }) {
  const [open, setOpen] = useState(s.roster.length > 0 && s.roster.some((r) => r.type === 'experimental' || r.health_attention))
  const trials = s.roster.filter((r) => r.type === 'experimental').length
  const attention = s.roster.filter((r) => r.health_attention).length
  const bdays = s.roster.filter((r) => r.birthday_today).length
  const past = new Date(s.starts_at).getTime() + s.duration_min * 60000 < Date.now()
  return (
    <li className={`overflow-hidden rounded-2xl bg-card ring-1 ring-line ${s.cancelled ? 'opacity-60' : ''}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-stretch text-left">
        <span className="w-1.5 shrink-0" style={{ background: s.modality_color || 'var(--color-accent)' }} />
        <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
          <span className="text-center">
            <span className={`block font-display text-2xl font-bold leading-none ${past ? 'text-fg-subtle' : ''}`}>{s.start_time}</span>
            <span className="text-[10px] font-semibold uppercase text-fg-subtle">{s.duration_min} min</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-lg font-bold uppercase leading-tight">{s.label || s.modality_name || 'Aula'}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
              {LEVEL[s.level] && <span>{LEVEL[s.level]}</span>}
              <span>· {s.coach_name || 'coach a definir'}</span>
              {!s.coach_name && !s.cancelled && <Chip tone="err">Sem coach</Chip>}
              {s.pending_swap && <Chip tone="warn">Troca pendente</Chip>}
              {s.cancelled && <Chip tone="err">Cancelada</Chip>}
              {trials > 0 && <Chip tone="info">{trials} experimental</Chip>}
              {attention > 0 && <Chip tone="warn">{attention} atenção saúde</Chip>}
              {bdays > 0 && <Chip tone="info">🎂 {bdays}</Chip>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-display text-xl font-bold leading-none">
              {s.booked_count}
              <span className="text-sm text-fg-subtle">/{s.capacity}</span>
            </span>
            {s.waitlist_count > 0 && <span className="text-[10px] font-semibold text-fg-muted">+{s.waitlist_count} na fila</span>}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          {coachCtl}
          {s.roster.length ? (
            <ul className="space-y-1.5">
              {s.roster.map((r) => {
                const [tone, label] = STATUS[r.status] || ['muted', r.status]
                return (
                  <PersonLine
                    key={r.person_id}
                    p={r}
                    tags={
                      <>
                        <Chip tone={tone}>{label}</Chip>
                        {r.type === 'experimental' && <Chip tone="info">Experimental</Chip>}
                        {r.type === 'dropin' && <Chip>Avulso</Chip>}
                        {r.first_class && r.type !== 'experimental' && <Chip tone="warn">1ª aula</Chip>}
                        {r.birthday_today && <Chip tone="info">Aniversário</Chip>}
                      </>
                    }
                  />
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">Ninguém reservado ainda.</p>
          )}
        </div>
      )}
    </li>
  )
}

/** Aulas dos próximos 7 dias. mineDefault: coach começa em "Minhas"; owner em "Todas". */
export function Turmas({ box, mineDefault = true, refreshKey = 0, header = null, isOwner = false, meId = null, notify = () => {} }) {
  const days = useMemo(() => nextDays(7), [])
  const [day, setDay] = useState(days[0].key)
  const [all, setAll] = useState(!mineDefault)
  const [state, setState] = useState({ status: 'loading', rows: [] })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      setState({ status: 'ok', rows: await api.fetchStaffSessions(box.id, { days: 7, all }) })
    } catch (e) {
      setState({ status: 'error', rows: [], message: e.message })
    }
  }, [box.id, all, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load()
  }, [load])

  // quem pode dar aula (seletores) e pedidos de troca (Realtime → recarrega as aulas também)
  const [coaches, setCoaches] = useState([])
  useEffect(() => {
    api.fetchStaffCoaches(box.id).then(setCoaches, () => setCoaches([]))
  }, [box.id])
  const swaps = useCoachSwaps(box.id, load)
  const changed = () => {
    load()
    swaps.reload()
  }
  const noCoach = state.rows.filter((r) => !r.cancelled && !r.coach_name && 'coach_id' in r).length

  const byDay = useMemo(() => {
    const m = {}
    for (const r of state.rows) (m[r.day] ||= []).push(r)
    return m
  }, [state.rows])
  const list = byDay[day] || []

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-xl bg-card p-1 ring-1 ring-line">
          {[
            [false, 'Minhas turmas'],
            [true, 'Todas'],
          ].map(([v, l]) => (
            <button key={l} onClick={() => setAll(v)} aria-pressed={all === v} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${all === v ? 'bg-inverse text-on-inverse' : 'text-fg-muted'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={load} aria-label="Atualizar" className="ml-auto rounded-xl p-2 text-fg-muted ring-1 ring-line hover:bg-card hover:text-fg">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-1">
        <div className="flex gap-2" role="tablist" aria-label="Dia">
          {days.map((d) => {
            const n = (byDay[d.key] || []).length
            const active = d.key === day
            return (
              <button
                key={d.key}
                role="tab"
                aria-selected={active}
                onClick={() => setDay(d.key)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 transition ${active ? 'bg-accent text-on-accent shadow' : 'bg-card text-fg-soft ring-1 ring-line hover:bg-elevated'}`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">{d.offset === 0 ? 'Hoje' : WEEKDAYS[d.weekday]}</span>
                <span className="font-display text-xl font-bold leading-none">{d.day}</span>
                <span className={`mt-0.5 text-[10px] font-semibold ${active ? 'text-on-accent/80' : 'text-fg-subtle'}`}>{n ? `${n} aula${n > 1 ? 's' : ''}` : '—'}</span>
              </button>
            )
          })}
        </div>
      </div>

      <SwapInbox swaps={swaps.rows} isOwner={isOwner} notify={notify} onChanged={changed} />
      {isOwner && noCoach > 0 && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-2xl bg-rose-500/10 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-200">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            <b>{noCoach} aula{noCoach > 1 ? 's' : ''} sem coach</b> nos próximos 7 dias. Abra a aula e toque em “Definir coach” — escolha “Toda semana” para fixar o coach da turma.
          </span>
        </p>
      )}
      {state.status === 'loading' && !state.rows.length && <Center />}
      {state.status === 'error' && <Empty icon={RefreshCw}>{state.message}</Empty>}
      {state.status !== 'error' && !(state.status === 'loading' && !state.rows.length) &&
        (list.length ? (
          <ul className="space-y-2">
            {list.map((s) => (
              <SessionCard
                key={s.session_id}
                s={s}
                coachCtl={'coach_id' in s && <CoachControl s={s} isOwner={isOwner} coaches={coaches} meId={meId} notify={notify} onChanged={changed} />}
              />
            ))}
          </ul>
        ) : (
          <Empty icon={CalendarX2}>
            {all ? 'Nenhuma aula neste dia.' : 'Você não tem turma neste dia.'}
            {!all && (
              <button onClick={() => setAll(true)} className="mt-1 font-semibold text-fg underline underline-offset-4">
                Ver todas as turmas
              </button>
            )}
          </Empty>
        ))}
    </div>
  )
}

/* ---------- abas do coach ---------- */

function Aniversariantes({ people }) {
  const thisMonth = Number(todayKey().slice(5, 7))
  const todayDay = Number(todayKey().slice(8, 10))
  const [month, setMonth] = useState(thisMonth)
  const list = people.filter((p) => p.birth_month === month).sort((a, b) => a.birth_day - b.birth_day)
  const shift = (d) => setMonth((x) => ((x - 1 + d + 12) % 12) + 1)
  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-card px-2 py-1.5 ring-1 ring-line">
        <button onClick={() => shift(-1)} aria-label="Mês anterior" className="rounded-lg p-2 text-fg-muted hover:bg-elevated hover:text-fg">
          <ChevronLeft size={18} />
        </button>
        <div className="font-display text-lg font-bold uppercase">
          {MONTHS[month - 1]} <span className="text-sm text-fg-subtle">· {list.length}</span>
        </div>
        <button onClick={() => shift(1)} aria-label="Próximo mês" className="rounded-lg p-2 text-fg-muted hover:bg-elevated hover:text-fg">
          <ChevronRight size={18} />
        </button>
      </div>
      {list.length ? (
        <ul className="space-y-2">
          {list.map((p) => {
            const isToday = month === thisMonth && p.birth_day === todayDay
            return (
              <li key={p.person_id} className={`flex items-center gap-3 rounded-2xl bg-card px-4 py-3 ${isToday ? 'ring-2 ring-accent' : 'ring-1 ring-line'}`}>
                <span className={`flex w-11 shrink-0 flex-col items-center rounded-xl py-1 ${isToday ? 'bg-accent text-on-accent' : 'bg-elevated'}`}>
                  <span className="font-display text-xl font-bold leading-none">{p.birth_day}</span>
                  <span className="text-[9px] font-bold uppercase">{isToday ? 'hoje' : MONTHS[month - 1].slice(0, 3)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="text-xs text-fg-muted">
                    {isToday ? 'Faz aniversário hoje 🎂' : p.next_class_at ? `Próxima aula: ${fmtDateTime(p.next_class_at)}` : 'Sem aula marcada'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty icon={CalendarHeart}>Nenhum aniversariante em {MONTHS[month - 1].toLowerCase()}.</Empty>
      )}
    </>
  )
}

function Experimentais({ people }) {
  const list = people
    .filter((p) => p.role === 'visitante')
    .sort((a, b) => (a.next_class_at || '9').localeCompare(b.next_class_at || '9'))
  if (!list.length) return <Empty icon={Sparkles}>Ninguém em aula experimental agora.</Empty>
  return (
    <>
      <p className="mb-3 text-xs text-fg-muted">Quem se cadastrou para conhecer o box. Abra a ficha de saúde antes da aula.</p>
      <ul className="space-y-2">
        {list.map((p) => (
          <PersonLine
            key={p.person_id}
            p={p}
            tags={
              p.next_class_at ? (
                <Chip tone="info">Aula {fmtDateTime(p.next_class_at)}</Chip>
              ) : p.trial_done ? (
                <Chip tone={p.last_class_status === 'presente' ? 'ok' : 'err'}>
                  {p.last_class_status === 'presente' ? 'Fez a aula' : 'Faltou'} · {fmtDate(p.last_class_at)}
                </Chip>
              ) : (
                <Chip>Ainda não agendou</Chip>
              )
            }
          />
        ))}
      </ul>
    </>
  )
}

export function CoachDashboard({ box, me, notify }) {
  const notices = useNotices(box.id)
  // solicitações do coach que ainda não estão no mural (pendentes ou recusadas)
  const myOpen = notices.rows.filter((n) => n.created_by === me.id && n.status !== 'published').length
  const [tab, setTab] = useState('turmas')
  const [people, setPeople] = useState({ status: 'loading', rows: [] })

  const loadPeople = useCallback(async () => {
    try {
      const rows = await api.fetchStaffPeople(box.id)
      setPeople({ status: 'ok', rows: rows.filter((p) => !p.is_test) })
    } catch (e) {
      setPeople({ status: 'error', rows: [], message: e.message })
    }
  }, [box.id])
  useEffect(() => {
    loadPeople()
  }, [loadPeople])

  const month = Number(todayKey().slice(5, 7))
  const bdays = people.rows.filter((p) => p.birth_month === month).length
  const bToday = people.rows.filter((p) => p.birthday_today).length
  const trials = people.rows.filter((p) => p.role === 'visitante').length
  const TABS = [
    ['turmas', 'Minhas turmas', null],
    ['treino', 'Treino', null],
    ['aniversariantes', 'Aniversariantes', bdays],
    ['experimental', 'Experimental', trials],
    ['avisos', 'Avisos', myOpen],
  ]

  return (
    <section>
      <div className="mb-4 rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Coach</div>
        <div className="font-display text-xl font-bold uppercase">Olá, {String(me.name).split(' ')[0]}!</div>
        <div className="text-xs text-fg-muted">
          {trials} em aula experimental · {bToday ? `${bToday} aniversariante${bToday > 1 ? 's' : ''} hoje 🎂` : `${bdays} aniversariante${bdays === 1 ? '' : 's'} no mês`}
        </div>
      </div>

      <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-card p-1 ring-1 ring-line">
        {TABS.map(([k, l, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex shrink-0 grow items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase ${tab === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted hover:text-fg'}`}
          >
            {l}
            {n > 0 && <span className={`rounded-full px-1.5 text-[10px] ${tab === k ? 'bg-on-inverse/20' : 'bg-elevated'}`}>{n}</span>}
          </button>
        ))}
      </div>

      {tab === 'turmas' && <Turmas box={box} mineDefault meId={me.id} notify={notify} />}
      {tab === 'treino' && <WodGestao box={box} notify={notify} />}
      {tab === 'avisos' && <AvisosGestao box={box} me={me} role="coach" notify={notify} notices={notices} />}
      {['aniversariantes', 'experimental'].includes(tab) && people.status === 'loading' && <Center />}
      {['aniversariantes', 'experimental'].includes(tab) && people.status === 'error' && <Empty icon={RefreshCw}>{people.message}</Empty>}
      {tab === 'aniversariantes' && people.status === 'ok' && <Aniversariantes people={people.rows} />}
      {tab === 'experimental' && people.status === 'ok' && <Experimentais people={people.rows} />}
    </section>
  )
}
