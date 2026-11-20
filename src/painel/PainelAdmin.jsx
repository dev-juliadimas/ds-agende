/*
 * Painel do administrador — /clientes/:slug/painel
 *
 * Mesmo login da agenda (e-mail e senha). O que aparece depende do papel no box:
 *   owner → Inadimplentes · Aniversariantes · Interessados · Turmas · Treino · Avisos · Alunos
 *   coach → Minhas turmas · Treino · Aniversariantes · Experimental · Avisos (StaffViews.jsx, sem financeiro)
 * Dados: RPCs admin_* de supabase/migrations/20261123_painel_admin.sql.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarHeart, ChevronLeft, ChevronRight, Hourglass, Lock, LogOut, RefreshCw, Search, Sparkles, UserX, Users, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { PRESETS } from '../lib/boxPresets'
import { boxLogos, brandCss } from '../lib/brand'
import { useTheme } from '../lib/theme'
import { brl } from '../lib/constants'
import { ThemeToggle } from '../components/ui'
import * as agendaApi from '../lib/api/agenda'
import * as api from '../lib/api/painel'
import AuthScreen from '../agenda/AuthScreen'
import { ToastStack, useToasts } from '../agenda/toasts'
import { Chip, LeadRow, MemberRow, PayButton, WaButton, fmtDate } from './parts'
import { CoachDashboard, Turmas } from './StaffViews'
import { IncomingSwapsPrompt } from './CoachSwaps'
import AvisosGestao from './AvisosGestao'
import WodGestao from './WodGestao'
import { SpecialDaysButton } from './DatasEspeciais'
import { useNotices } from '../avisos/shared'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const firstName = (n) => String(n || '').split(' ')[0]
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/* ---------- moldura ---------- */

function Shell({ box, slug, theme, toggle, onLogout, kicker = 'Painel', children }) {
  const [logoOk, setLogoOk] = useState(true)
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            {box && logoOk && (
              <span className="inline-block h-11 w-11 shrink-0 overflow-hidden">
                <img src={boxLogos(box.id).escura} alt="" onError={() => setLogoOk(false)} className="logo-light h-full w-full scale-125 object-contain" />
                <img src={boxLogos(box.id).completa} alt="" onError={() => setLogoOk(false)} className="logo-dark h-full w-full scale-125 object-contain" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-highlight">{kicker}</div>
              <div className="truncate font-display text-lg font-bold uppercase leading-tight">{box?.name || 'DS Agende'}</div>
            </div>
            {slug && (
              <Link to={`/clientes/${slug}/agenda`} className="hidden rounded-lg px-2.5 py-1.5 text-xs font-semibold text-fg-soft ring-1 ring-line hover:bg-card sm:block">
                Ver agenda
              </Link>
            )}
            <ThemeToggle theme={theme} onToggle={toggle} />
            {onLogout && (
              <button onClick={onLogout} aria-label="Sair" title="Sair" className="rounded-lg p-2 text-fg-muted hover:bg-card hover:text-fg">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 pb-12 pt-4">{children}</main>
      </div>
    </div>
  )
}

const Center = () => (
  <div className="flex justify-center py-16 text-fg-muted">
    <Loader2 className="animate-spin" size={24} aria-label="Carregando" />
  </div>
)

function Empty({ icon: Icon = Users, children }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center text-sm text-fg-muted ring-1 ring-line">
      <Icon size={24} className="text-fg-subtle" />
      {children}
    </div>
  )
}

/* ---------- topo: números ---------- */

function Stat({ label, value, sub, tone = 'text-fg', onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl bg-card px-3 py-3 text-left ring-1 transition hover:ring-line-strong ${active ? 'ring-2 ring-accent' : 'ring-line'}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`font-display text-2xl font-bold leading-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-fg-muted">{sub}</div>}
    </button>
  )
}

/* ---------- abas ---------- */

function Inadimplentes({ members, notify, reload }) {
  const list = members
    .filter((m) => m.role === 'aluno' && (m.billing === 'carencia' || m.billing === 'bloqueado'))
    .sort((a, b) => b.days_late - a.days_late)
  if (!list.length) return <Empty icon={UserX}>Ninguém com mensalidade atrasada. 🎉</Empty>
  return (
    <>
      <p className="mb-3 text-xs text-fg-muted">
        <b className="text-fg">Carência</b>: venceu, mas ainda reserva. <b className="text-fg">Bloqueado</b>: carência acabou, não reserva e as aulas futuras foram liberadas.
      </p>
      <ul className="space-y-2">
        {list.map((m) => (
          <MemberRow
            key={m.person_id}
            m={m}
            notify={notify}
            onChanged={reload}
            sub={<span>{m.plan_name || 'Sem plano'} · venceu {fmtDate(m.due_date)}{m.pending_amount ? ` · ${brl(m.pending_amount)}` : ''}</span>}
            actions={
              <>
                <WaButton
                  phone={m.phone}
                  label="Cobrar"
                  text={`Olá, ${firstName(m.name)}! Sua mensalidade venceu em ${fmtDate(m.due_date)}. Quer acertar por Pix ou na recepção?`}
                />
                <PayButton m={m} notify={notify} onChanged={reload} />
              </>
            }
          />
        ))}
      </ul>
    </>
  )
}

function Aniversariantes({ members, today, notify, reload }) {
  const thisMonth = Number(String(today).slice(5, 7)) || new Date().getMonth() + 1
  const todayDay = Number(String(today).slice(8, 10))
  const [month, setMonth] = useState(thisMonth)
  const list = members.filter((m) => m.birth_month === month).sort((a, b) => a.birth_day - b.birth_day)
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
      {!list.length ? (
        <Empty icon={CalendarHeart}>Nenhum aniversariante em {MONTHS[month - 1].toLowerCase()}.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const isToday = month === thisMonth && m.birth_day === todayDay
            const passed = month === thisMonth && m.birth_day < todayDay
            return (
              <MemberRow
                key={m.person_id}
                m={m}
                notify={notify}
                onChanged={reload}
                highlight={isToday}
                aside={
                  <span className={`flex w-11 shrink-0 flex-col items-center rounded-xl py-1 ${isToday ? 'bg-accent text-on-accent' : passed ? 'bg-elevated text-fg-subtle' : 'bg-elevated text-fg'}`}>
                    <span className="font-display text-xl font-bold leading-none">{m.birth_day}</span>
                    <span className="text-[9px] font-bold uppercase">{isToday ? 'hoje' : MONTHS[month - 1].slice(0, 3)}</span>
                  </span>
                }
                sub={<span>{m.age != null ? `${isToday || passed ? m.age : m.age + 1} anos` : ''}</span>}
                actions={
                  isToday ? (
                    <WaButton phone={m.phone} label="Dar parabéns" text={`Parabéns, ${firstName(m.name)}! 🎉 Feliz aniversário de toda a equipe do box. Bora comemorar no treino? 💪`} />
                  ) : null
                }
              />
            )
          })}
        </ul>
      )}
    </>
  )
}

function Interessados({ members, leads, box, notify, reload }) {
  const [showArchived, setShowArchived] = useState(false)
  const openLeads = leads.filter((l) => (showArchived ? true : l.status === 'novo' || l.status === 'contatado'))
  const trials = members.filter((m) => m.role === 'visitante').sort((a, b) => Number(b.trial_done) - Number(a.trial_done))
  const unpaid = members.filter((m) => m.financial_status === 'aguardando_pagamento' && m.role !== 'visitante')

  const Title = ({ children, count }) => (
    <h3 className="mb-2 mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted first:mt-0">
      {children} <Chip>{count}</Chip>
    </h3>
  )
  return (
    <div>
      <Title count={openLeads.length}>Pelo formulário da página</Title>
      {openLeads.length ? (
        <ul className="space-y-2">
          {openLeads.map((l) => (
            <LeadRow key={l.id} l={l} box={box} notify={notify} onChanged={reload} />
          ))}
        </ul>
      ) : (
        <Empty icon={Sparkles}>Nenhum pedido novo. O formulário fica em “Tenho interesse” na página do box.</Empty>
      )}
      {leads.some((l) => l.status === 'convertido' || l.status === 'descartado') && (
        <button onClick={() => setShowArchived((s) => !s)} className="mt-2 text-xs font-semibold text-fg-soft underline underline-offset-4 hover:text-fg">
          {showArchived ? 'Esconder convertidos e arquivados' : 'Mostrar convertidos e arquivados'}
        </button>
      )}

      <Title count={trials.length}>Aula experimental</Title>
      {trials.length ? (
        <ul className="space-y-2">
          {trials.map((m) => (
            <MemberRow
              key={m.person_id}
              m={m}
              notify={notify}
              onChanged={reload}
              sub={<span>{m.last_class_at ? `aula ${fmtDate(m.last_class_at)} · ${m.last_class_status}` : 'ainda não agendou'}</span>}
              actions={
                <WaButton
                  phone={m.phone}
                  label={m.trial_done ? 'Oferecer plano' : 'Chamar'}
                  text={
                    m.trial_done
                      ? `Oi, ${firstName(m.name)}! Curtiu a aula experimental? Posso te mostrar os planos?`
                      : `Oi, ${firstName(m.name)}! Vi seu cadastro para a aula experimental. Quer ajuda para escolher o horário?`
                  }
                />
              }
            />
          ))}
        </ul>
      ) : (
        <Empty icon={Sparkles}>Ninguém cadastrado para aula experimental.</Empty>
      )}

      <Title count={unpaid.length}>Escolheu plano, ainda não pagou</Title>
      {unpaid.length ? (
        <ul className="space-y-2">
          {unpaid.map((m) => (
            <MemberRow
              key={m.person_id}
              m={m}
              notify={notify}
              onChanged={reload}
              sub={<span>{m.plan_name}{m.pending_amount ? ` · ${brl(m.pending_amount)}` : ''}</span>}
              actions={<PayButton m={m} notify={notify} onChanged={reload} />}
            />
          ))}
        </ul>
      ) : (
        <Empty icon={Sparkles}>Nenhum cadastro aguardando o 1º pagamento.</Empty>
      )}
    </div>
  )
}

const STATUS_FILTERS = [
  ['todos', 'Todos'],
  ['alunos', 'Alunos'],
  ['equipe', 'Equipe'],
  ['experimental', 'Experimental'],
]

function Alunos({ members, notify, reload }) {
  const [f, setF] = useState('alunos')
  const list = members.filter((m) =>
    f === 'todos' ? true : f === 'alunos' ? m.role === 'aluno' || m.role === 'dropin' : f === 'equipe' ? m.role === 'owner' || m.role === 'coach' : m.role === 'visitante',
  )
  return (
    <>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {STATUS_FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${f === k ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line'}`}>
            {l}
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="space-y-2">
          {list.map((m) => (
            <MemberRow key={m.person_id} m={m} notify={notify} onChanged={reload} />
          ))}
        </ul>
      ) : (
        <Empty>Ninguém aqui.</Empty>
      )}
    </>
  )
}

/* ---------- página ---------- */

function Dashboard({ box, me, notify }) {
  // avisos: um canal Realtime só, para o contador de pendentes e a aba Avisos
  const notices = useNotices(box.id, {
    onNew: (n) => n.status === 'pending' && n.created_by !== me?.id && notify(`Nova solicitação de aviso${n.author_name ? ` de ${n.author_name.split(' ')[0]}` : ''}: ${n.title}`),
  })
  const pendingNotices = notices.rows.filter((n) => n.status === 'pending').length
  const [data, setData] = useState({ status: 'loading' })
  const [tab, setTab] = useState('inadimplentes')
  const [q, setQ] = useState('')
  const [showTest, setShowTest] = useState(false)
  const [turmasKey, setTurmasKey] = useState(0)

  const load = useCallback(async () => {
    try {
      const [overview, members, leads] = await Promise.all([api.fetchOverview(box.id), api.fetchMembers(box.id), api.fetchLeads(box.id)])
      setData({ status: 'ok', overview, members, leads })
    } catch (e) {
      setData((d) => (d.status === 'ok' ? d : { status: 'error', message: e.message }))
      if (data.status === 'ok') notify(e.message, 'err')
    }
  }, [box.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (data.status !== 'ok') return { members: [], leads: [] }
    const t = norm(q).trim()
    const digits = q.replace(/\D/g, '')
    const match = (name, phone) => !t || norm(name).includes(t) || (digits.length >= 3 && String(phone).replace(/\D/g, '').includes(digits))
    return {
      members: data.members.filter((m) => (showTest || !m.is_test) && match(m.name, m.phone)),
      leads: data.leads.filter((l) => match(l.name, l.phone)),
    }
  }, [data, q, showTest])

  if (data.status === 'loading') return <Center />
  if (data.status === 'error') {
    return (
      <Empty icon={RefreshCw}>
        Não foi possível carregar o painel. {data.message}
        <button onClick={load} className="mt-2 font-semibold text-fg underline underline-offset-4">
          Tentar de novo
        </button>
      </Empty>
    )
  }

  const o = data.overview
  // leads em aberto (novo + contatado), como na lista da aba Interessados
  const openLeads = data.leads.filter((l) => l.status === 'novo' || l.status === 'contatado').length
  const interessados = openLeads + o.experimentais + o.aguardando_pgto
  const TABS = [
    ['inadimplentes', 'Inadimplentes', o.carencia + o.bloqueados],
    ['aniversariantes', 'Aniversariantes', o.aniversariantes_mes],
    ['interessados', 'Interessados', interessados],
    ['turmas', 'Turmas', null],
    ['treino', 'Treino', null],
    ['avisos', 'Avisos', pendingNotices],
    ['alunos', 'Alunos', null],
  ]

  return (
    <section>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Alunos em dia" value={o.alunos_ativos} onClick={() => setTab('alunos')} active={tab === 'alunos'} />
        <Stat
          label="Inadimplentes"
          value={o.carencia + o.bloqueados}
          sub={`${o.carencia} carência · ${o.bloqueados} bloq.`}
          tone={o.bloqueados ? 'text-rose-600 dark:text-rose-300' : 'text-fg'}
          onClick={() => setTab('inadimplentes')}
          active={tab === 'inadimplentes'}
        />
        <Stat label="Interessados" value={interessados} sub={`${o.leads_novos} novo${o.leads_novos === 1 ? '' : 's'} no formulário`} tone="text-highlight" onClick={() => setTab('interessados')} active={tab === 'interessados'} />
        <Stat
          label="Aniversariantes"
          value={o.aniversariantes_mes}
          sub={o.aniversariantes_hoje ? `${o.aniversariantes_hoje} hoje 🎂` : 'neste mês'}
          onClick={() => setTab('aniversariantes')}
          active={tab === 'aniversariantes'}
        />
      </div>
      {Number(o.a_receber) > 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          A receber (cobranças pendentes): <b className="text-fg">{brl(o.a_receber)}</b>
        </p>
      )}
      {pendingNotices > 0 && tab !== 'avisos' && (
        <button
          onClick={() => setTab('avisos')}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-left ring-1 ring-amber-500/30 transition hover:bg-amber-500/15"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 font-display text-base font-bold text-white">{pendingNotices}</span>
          <span className="min-w-0 flex-1 text-sm">
            <b className="block text-fg">Solicitações pendentes</b>
            <span className="text-xs text-fg-muted">
              {pendingNotices === 1 ? 'Um aviso de coach espera' : `${pendingNotices} avisos de coaches esperam`} sua aprovação para ir ao mural.
            </span>
          </span>
          <Hourglass size={18} className="shrink-0 text-amber-700 dark:text-amber-300" />
        </button>
      )}

      <div className="sticky top-[69px] z-20 -mx-4 mt-4 bg-canvas/95 px-4 pb-2 pt-1 backdrop-blur">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-card p-1 ring-1 ring-line">
          {TABS.map(([k, l, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`flex shrink-0 grow items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase ${tab === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted hover:text-fg'}`}
            >
              {l}
              {n != null && n > 0 && <span className={`rounded-full px-1.5 text-[10px] ${tab === k ? 'bg-on-inverse/20' : 'bg-elevated'}`}>{n}</span>}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou WhatsApp"
              aria-label="Buscar"
              className="w-full rounded-xl border border-line bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-accent/60"
            />
          </label>
          <button onClick={load} aria-label="Atualizar" title="Atualizar" className="rounded-xl p-2.5 text-fg-muted ring-1 ring-line hover:bg-card hover:text-fg">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="mt-2">
        {tab === 'inadimplentes' && <Inadimplentes members={filtered.members} notify={notify} reload={load} />}
        {tab === 'aniversariantes' && <Aniversariantes members={filtered.members} today={o.hoje} notify={notify} reload={load} />}
        {tab === 'interessados' && <Interessados members={filtered.members} leads={filtered.leads} box={box} notify={notify} reload={load} />}
        {tab === 'turmas' && (
          <>
            <SpecialDaysButton
              box={box}
              staff={data.members.filter((m) => m.role === 'coach' || m.role === 'owner')}
              notify={notify}
              onChanged={() => setTurmasKey((k) => k + 1)}
            />
            <Turmas box={box} mineDefault={false} refreshKey={turmasKey} isOwner meId={me?.id} notify={notify} />
          </>
        )}
        {tab === 'treino' && <WodGestao box={box} notify={notify} />}
        {tab === 'avisos' && <AvisosGestao box={box} me={me} role="owner" notify={notify} notices={notices} />}
        {tab === 'alunos' && <Alunos members={filtered.members} notify={notify} reload={load} />}
      </div>

      {data.members.some((m) => m.is_test) && (
        <label className="mt-6 flex items-center justify-center gap-2 text-xs text-fg-subtle">
          <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Mostrar contas de teste
        </label>
      )}
    </section>
  )
}

export default function PainelAdmin() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const dbSlug = PRESETS[slug]?.dbSlug || slug
  const { theme, toggle } = useTheme()
  const { toasts, push } = useToasts()
  const [box, setBox] = useState(null)
  const [boxState, setBoxState] = useState('loading')
  const [view, setView] = useState('loading') // loading | auth | denied | painel | coach
  const [me, setMe] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return setBoxState('error')
    agendaApi
      .getBoxPublic(dbSlug)
      .then((b) => {
        setBox(b)
        setBoxState(!b ? 'missing' : b.is_active === false ? 'suspended' : 'ready')
      })
      .catch(() => setBoxState('error'))
  }, [dbSlug])

  useEffect(() => {
    if (!box) return
    document.title = `Painel • ${box.name}`
    const css = brandCss(box.brand_primary, box.brand_secondary)
    if (!css) return
    const el = document.createElement('style')
    el.textContent = css
    document.head.appendChild(el)
    return () => el.remove()
  }, [box])

  const check = useCallback(async () => {
    if (!box) return
    setView('loading')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session || data.session.user.is_anonymous) return setView('auth')
      const person = await agendaApi.fetchMe(box.id)
      setMe(person)
      setView(person?.role === 'owner' ? 'painel' : person?.role === 'coach' ? 'coach' : 'denied')
    } catch {
      setView('auth')
    }
  }, [box])

  useEffect(() => {
    check()
  }, [check])

  const logout = async () => {
    await agendaApi.signOut()
    setView('auth')
  }

  if (boxState !== 'ready') {
    return (
      <Shell theme={theme} toggle={toggle}>
        {boxState === 'loading' ? <Center /> : <Empty icon={Lock}>{boxState === 'missing' ? 'Box não encontrado.' : boxState === 'suspended' ? 'O acesso deste box ao DS Agende está suspenso. Fale com o suporte do DS Agende para reativar.' : 'Painel indisponível. Tente de novo em instantes.'}</Empty>}
      </Shell>
    )
  }

  return (
    <Shell box={box} slug={slug} theme={theme} toggle={toggle} kicker={view === 'coach' ? 'Painel do coach' : view === 'painel' ? 'Painel do administrador' : 'Painel'} onLogout={view === 'painel' || view === 'coach' || view === 'denied' ? logout : null}>
      <ToastStack toasts={toasts} />
      {view === 'loading' && <Center />}
      {view === 'auth' && (
        <div className="mx-auto max-w-md">
          <AuthScreen box={box} slug={slug} onDone={check} notify={push} onSignup={() => navigate(`/clientes/${slug}/agenda`)} loginText={`Entre com a sua conta de administrador ou coach do ${box.name}.`} />
        </div>
      )}
      {view === 'denied' && (
        <div className="mx-auto max-w-md">
          <Empty icon={Lock}>
            <b className="text-fg">Esta conta não é da equipe do {box.name}.</b>
            O painel é só para o administrador e os coaches do box.
            <Link to={`/clientes/${slug}/agenda`} className="mt-2 font-semibold text-fg underline underline-offset-4">
              Ir para a agenda
            </Link>
          </Empty>
        </div>
      )}
      {view === 'painel' && <Dashboard box={box} me={me} notify={push} />}
      {view === 'coach' && me && <CoachDashboard box={box} me={me} notify={push} />}
      {/* pedido de troca de aula para quem entrou: abre na frente, em qualquer aba */}
      {(view === 'painel' || view === 'coach') && me && <IncomingSwapsPrompt box={box} notify={push} />}
    </Shell>
  )
}
