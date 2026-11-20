/*
 * Agenda do Aluno — /clientes/:slug/agenda
 *
 * Conectada ao Supabase de verdade: lê com get_agenda, reserva/cancela/fila pelas
 * RPCs app_* (regras no banco) e atualiza vagas por Realtime (ver useAgenda.js).
 *
 * Abas: Agenda · Avisos (Mural do Box, com Realtime — ver MuralAvisos.jsx) · Perfil
 * (horários fixos — migrations/20261130_horario_fixo.sql).
 *
 * Identificação: enquanto o login real não existe, o aluno escolhe um cadastro de
 * teste (people.is_test) — ver loginAsTestPerson em src/lib/api/agenda.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CalendarX2, ChevronDown, CircleUser, Dumbbell, Megaphone, Clock, Loader2, Lock, LogOut, MessageCircle, Pin, Radio, RefreshCw, Search, User, Users } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { PRESETS } from '../lib/boxPresets'
import { brl } from '../lib/constants'
import { boxLogos, brandCss } from '../lib/brand'
import { useTheme } from '../lib/theme'
import { ThemeToggle } from '../components/ui'
import * as api from '../lib/api/agenda'
import { useAgenda } from './useAgenda'
import { useWods } from './useWods'
import { useRecurring, slotKey } from './useRecurring'
import Perfil from './Perfil'
import AuthScreen, { LinkAccount } from './AuthScreen'
import SignupWizard from './signup/SignupWizard'
import { ToastStack, useToasts } from './toasts'
import MuralAvisos, { countUnseen, readSeen } from './MuralAvisos'
import { Modal, useNotices } from '../avisos/shared'

const BOX_TZ = 'America/Sao_Paulo'
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const PLAN_LABEL = { '2x': '2x/semana', '3x': '3x/semana', ilimitado: 'Livre' }
// Linha abaixo do nome no cabeçalho
function memberLabel(me) {
  const pending = me.financial_status === 'aguardando_pagamento' ? ' · aguardando pagamento' : ''
  if (me.role === 'visitante') return 'Aula experimental'
  if (me.role === 'dropin') return `Aula avulsa${pending}`
  if (me.role === 'owner') return 'Administrador'
  if (me.role !== 'aluno') return me.role === 'coach' ? 'Coach' : me.role
  return `Plano ${PLAN_LABEL[me.plan] || (me.plan_id ? '1x/semana' : '—')}${pending}`
}
const LEVEL_LABEL = { misto: 'Misto', iniciante: 'Iniciante', scaled: 'Scaled', rx: 'RX' }

/* ---------- datas no fuso do box ---------- */

const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: BOX_TZ }).format(new Date())

function nextDays(n) {
  const [y, m, d] = todayKey().split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i))
    return { key: dt.toISOString().slice(0, 10), weekday: dt.getUTCDay(), day: dt.getUTCDate(), offset: i }
  })
}

// 'YYYY-MM-DD' → 0 = domingo (mesma convenção de schedule_slots.weekday)
const weekdayOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

const fmtTime = (date) => new Intl.DateTimeFormat('pt-BR', { timeZone: BOX_TZ, hour: '2-digit', minute: '2-digit' }).format(date)

/* ---------- situação de cada aula ---------- */

function sessionState(r, now) {
  const start = new Date(r.starts_at)
  const full = r.booked_count >= r.capacity
  // o banco aceita reserva até 15 min depois do início (book_class); a fila só antes do início
  const ended = r.closed || now > start.getTime() + 15 * 60 * 1000
  if (r.cancelled) return { key: 'cancelada', label: 'Cancelada', tone: 'muted' }
  if (r.my_booking_status === 'presente') return { key: 'presente', label: 'Presente', tone: 'ok' }
  if (r.my_booking_id) return { key: 'inscrito', label: 'Inscrito', tone: 'ok' }
  if (r.my_waitlist_pos) return { key: 'fila', label: `Na fila · ${r.my_waitlist_pos}º`, tone: 'warn' }
  if (ended) return { key: 'encerrada', label: 'Encerrada', tone: 'muted' }
  if (full) return { key: 'lotada', label: 'Lotada', tone: 'err', started: now >= start.getTime() }
  return { key: 'disponivel', label: 'Disponível', tone: 'accent' }
}

const TONE = {
  ok: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300',
  err: 'bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300',
  accent: 'bg-accent/15 text-fg ring-accent/40',
  muted: 'bg-elevated text-fg-muted ring-line',
}

/* ---------- página ---------- */

export default function AgendaAluno() {
  const { slug } = useParams()
  const preset = PRESETS[slug]
  const dbSlug = preset?.dbSlug || slug
  const { theme, toggle } = useTheme()
  const { toasts, push } = useToasts()

  const [box, setBox] = useState(null)
  const [boxState, setBoxState] = useState('loading') // loading | ready | missing | error
  const [me, setMe] = useState(null)
  // loading | auth (entrar) | signup (auto-cadastro) | signup-finish (conta sem cadastro gravado)
  // | test (seletor de teste) | link (conta sem cadastro) | reset (nova senha) | agenda
  const [view, setView] = useState('loading')
  const [isTest, setIsTest] = useState(false)
  const [linkMsg, setLinkMsg] = useState('')
  const [prefill, setPrefill] = useState(null) // { name, phone } do auto-cadastro interrompido
  const [authMode, setAuthMode] = useState('login')
  // veio do link "Esqueci a senha" do e-mail
  const [recovering, setRecovering] = useState(() => new URLSearchParams(window.location.search).has('redefinir'))

  // 1. Box pelo slug
  useEffect(() => {
    if (!isSupabaseConfigured) return setBoxState('error')
    let alive = true
    api
      .getBoxPublic(dbSlug)
      .then((b) => {
        if (!alive) return
        if (b) api.rememberReferral(b.id) // guarda o ?ref= para o cadastro
        setBox(b)
        setBoxState(!b ? 'missing' : b.is_active === false ? 'suspended' : 'ready')
      })
      .catch(() => alive && setBoxState('error'))
    return () => {
      alive = false
    }
  }, [dbSlug])

  // Título e cores do box
  useEffect(() => {
    if (!box) return
    document.title = `Agenda • ${box.name}`
    const css = box.brand_primary && box.brand_secondary ? brandCss(box.brand_primary, box.brand_secondary) : ''
    if (!css) return
    const el = document.createElement('style')
    el.textContent = css
    document.head.appendChild(el)
    return () => el.remove()
  }, [box])

  // 2. Quem está logado neste box
  const loadMe = useCallback(async () => {
    if (!box) return
    setView('loading')
    try {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        setMe(null)
        // link do Indique e Ganhe (?ref=CODIGO): abre direto em "Criar conta"
        return setView(new URLSearchParams(window.location.search).has('ref') ? 'signup' : 'auth')
      }
      setIsTest(Boolean(user.is_anonymous))
      let person = await api.fetchMe(box.id)
      // auto-cadastro deste box que não chegou a gravar (ex.: caiu a conexão no fim): termina o cadastro
      const meta = user.user_metadata || {}
      if (!person && !user.is_anonymous && meta.self_signup?.box_id === box.id) {
        setPrefill({ name: meta.full_name, phone: meta.phone })
        setMe(null)
        return setView('signup-finish')
      }
      // conta de e-mail recém-confirmada: liga ao cadastro pelo telefone informado no cadastro
      if (!person && !user.is_anonymous) {
        const res = await api.linkMyAccount(box.id)
        if (res.ok) person = res.data
        else setLinkMsg(res.code === 'TELEFONE_NAO_CADASTRADO' ? '' : res.message)
      }
      setMe(person)
      setView(person ? 'agenda' : user.is_anonymous ? 'test' : 'link')
    } catch {
      setMe(null)
      setView('auth')
    }
  }, [box])

  useEffect(() => {
    if (recovering) return setView('reset')
    loadMe()
  }, [loadMe, recovering])

  // Link de confirmação do e-mail: getSession() já espera o Supabase ler o token da URL,
  // então loadMe() encontra a sessão sozinho. Link de nova senha: além do ?redefinir=1,
  // o evento PASSWORD_RECOVERY cobre o caso de o parâmetro se perder no redirecionamento.
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const finishRecovery = () => {
    window.history.replaceState(null, '', window.location.pathname)
    setRecovering(false)
  }

  const onTestPick = async (person) => {
    const res = await api.loginAsTestPerson(person.id)
    push(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) loadMe()
  }

  const onLogout = async () => {
    await api.signOut()
    setAuthMode('login')
    setMe(null)
    setIsTest(false)
    setView('auth')
  }

  if (boxState === 'loading') return <Shell theme={theme} toggle={toggle}><CenterLoader /></Shell>
  if (boxState !== 'ready') {
    return (
      <Shell theme={theme} toggle={toggle}>
        <EmptyState
          title={boxState === 'missing' ? 'Box não encontrado' : boxState === 'suspended' ? 'Agenda temporariamente indisponível' : 'Agenda indisponível'}
          text={boxState === 'missing' ? 'Confira o endereço.' : boxState === 'suspended' ? 'As reservas deste box estão pausadas no momento. Fale com a recepção.' : 'Não foi possível conectar ao servidor. Tente de novo em instantes.'}
        />
      </Shell>
    )
  }

  const showMe = view === 'agenda' ? me : null
  return (
    <Shell
      theme={theme}
      toggle={toggle}
      box={box}
      slug={slug}
      me={showMe}
      onSwitch={isTest ? () => setView('test') : null}
      onLogout={onLogout}
    >
      <ToastStack toasts={toasts} />
      {view === 'loading' && <CenterLoader />}
      {view === 'auth' && (
        <AuthScreen
          key={authMode}
          box={box}
          slug={slug}
          initialMode={authMode}
          onDone={loadMe}
          notify={push}
          onSignup={() => setView('signup')}
          onTest={box.test_login_enabled ? () => setView('test') : null}
        />
      )}
      {view === 'signup' && (
        <SignupWizard
          box={box}
          slug={slug}
          onDone={loadMe}
          notify={push}
          onCancel={() => { setAuthMode('login'); setView('auth') }}
          onExisting={() => { setAuthMode('signup'); setView('auth') }}
        />
      )}
      {view === 'signup-finish' && (
        <SignupWizard box={box} slug={slug} mode="finish" prefill={prefill} onDone={loadMe} notify={push} onCancel={onLogout} />
      )}
      {view === 'reset' && <AuthScreen box={box} slug={slug} initialMode="reset" onDone={finishRecovery} notify={push} />}
      {view === 'link' && <LinkAccount box={box} message={linkMsg} onLinked={loadMe} onLogout={onLogout} notify={push} />}
      {view === 'test' && (
        <TestLogin box={box} onPick={onTestPick} onCancel={me ? () => setView('agenda') : () => setView('auth')} cancelLabel={me ? 'Voltar para a agenda' : 'Entrar com e-mail e senha'} />
      )}
      {view === 'agenda' && me && <AlunoHome box={box} slug={slug} me={me} notify={push} />}
    </Shell>
  )
}

/* ---------- abas do aluno: Agenda · Avisos ---------- */

function AlunoHome({ box, slug, me, notify }) {
  // ?aba=avisos (link do aviso compartilhado na Comunidade) abre direto no mural
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('aba') === 'avisos' ? 'avisos' : 'agenda'))
  // horários fixos: a Agenda marca o card e o Perfil lista/desativa (mesmo estado)
  const recurring = useRecurring(box.id, me)
  const tabRef = useRef(tab)
  tabRef.current = tab
  const [seen, setSeen] = useState(() => readSeen(box.id))
  // aviso novo publicado pelo coach com o aluno na Agenda → toast
  const notices = useNotices(box.id, {
    publishedOnly: true,
    onNew: (n) => tabRef.current !== 'avisos' && notify(`${n.category === 'urgente' ? '🚨' : '📣'} Novo aviso: ${n.title}`, n.category === 'urgente' ? 'err' : 'ok'),
  })
  const unseen = tab === 'avisos' ? 0 : countUnseen(notices.rows, seen)

  const go = (k) => {
    if (tab === 'avisos') setSeen(readSeen(box.id)) // saindo do mural: zera o contador
    setTab(k)
  }

  const TABS = [
    ['agenda', 'Agenda', CalendarDays],
    ['avisos', 'Avisos', Megaphone],
    ['perfil', 'Perfil', CircleUser],
  ]
  return (
    <>
      <div role="tablist" aria-label="Seções" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
        {TABS.map(([k, l, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => go(k)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold uppercase ${tab === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted hover:text-fg'}`}
          >
            <Icon size={14} /> {l}
            {k === 'avisos' && unseen > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 text-[10px] text-white" aria-label={`${unseen} novos`}>
                {unseen}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === 'agenda' && <Agenda box={box} me={me} notify={notify} recurring={recurring} onOpenProfile={() => go('perfil')} />}
      {tab === 'avisos' && <MuralAvisos box={box} notices={notices} />}
      {tab === 'perfil' && <Perfil box={box} slug={slug} me={me} memberLabel={memberLabel(me)} recurring={recurring} notify={notify} />}
    </>
  )
}

/* ---------- recém-cadastrado na aula experimental: o que fazer agora ---------- */
// (pagamento pendente / plano bloqueado: PlanBanner)

function WelcomeBanner({ me }) {
  if (me.financial_status !== 'experimental') return null
  return (
    <div className="mb-4 rounded-2xl bg-card p-4 ring-1 ring-accent/40">
      <div className="font-display text-base font-bold uppercase leading-tight">Agende sua aula experimental</div>
      <p className="mt-1 text-sm text-fg-muted">
        Escolha um horário de turma Iniciante ou Mista. Depois da aula, o box te ajuda a escolher o plano.
      </p>
    </div>
  )
}

/* ---------- trava de plano ativo (migrations/20261129_trava_plano_ativo.sql) ---------- */

const fmtDay = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '')

const PLAN_LOCK = {
  pendente: {
    title: 'Plano aguardando ativação',
    text: (ps, box) =>
      `${ps.plan_name || 'Seu plano'}${ps.pending_amount ? ` · ${brl(ps.pending_amount)}` : ''} ainda está aguardando o pagamento. Regularize na recepção do ${box.name} para liberar seus agendamentos.`,
  },
  bloqueado: {
    title: 'Plano suspenso',
    text: (ps) =>
      `Sua mensalidade${ps.due_date ? ` venceu em ${fmtDay(ps.due_date)} e` : ''} a carência acabou. Regularize o pagamento para voltar a agendar.`,
  },
  sem_plano: {
    title: 'Você ainda não tem um plano',
    text: () => 'Escolha um plano para liberar seus agendamentos.',
  },
}

/** Botão "Ativar / Pagar plano": WhatsApp da recepção (se o box tiver) ou a seção Planos da página do box. */
function PayPlanLink({ box, className }) {
  const { slug } = useParams()
  const wa = PRESETS[slug]?.page?.whatsapp
  const label = (
    <>
      {wa ? <MessageCircle size={14} /> : null} Ativar / Pagar plano
    </>
  )
  if (wa) {
    const msg = encodeURIComponent(`Olá! Quero ativar/pagar meu plano no ${box.name} para liberar meus agendamentos.`)
    return (
      <a href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    )
  }
  return (
    <Link to={`/clientes/${slug}#planos`} className={className}>
      {label}
    </Link>
  )
}

function PlanBanner({ box, ps }) {
  if (!ps) return null
  if (ps.status === 'carencia') {
    return (
      <div role="status" className="mb-4 rounded-2xl bg-amber-500/10 p-3 text-sm ring-1 ring-amber-500/30">
        <b className="text-amber-700 dark:text-amber-200">Mensalidade vencida{ps.due_date ? ` em ${fmtDay(ps.due_date)}` : ''}</b>
        <span className="block text-fg-muted">
          {ps.grace_left > 0
            ? `Você ainda pode agendar por ${ps.grace_left} dia${ps.grace_left > 1 ? 's' : ''} de carência.`
            : 'Hoje é o último dia de carência para agendar.'}
        </span>
      </div>
    )
  }
  const info = ps.can_book ? null : PLAN_LOCK[ps.status] || PLAN_LOCK.sem_plano
  if (!info) return null
  return (
    <div role="alert" className="mb-4 rounded-2xl bg-rose-500/10 p-4 ring-1 ring-rose-500/40">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300">
          <Lock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-bold uppercase leading-tight">{info.title}</div>
          <p className="mt-1 text-sm text-fg-muted">{info.text(ps, box)}</p>
        </div>
      </div>
      <PayPlanLink
        box={box}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong active:scale-[.98]"
      />
    </div>
  )
}

/* ---------- moldura ---------- */

function BoxLogo({ box }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-raiz font-display text-xs font-extrabold text-ambar ring-1 ring-ambar/50">
        {box.name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()}
      </span>
    )
  }
  const logos = boxLogos(box.id)
  const img = 'h-full w-full scale-125 object-contain'
  return (
    <span className="inline-block h-11 w-11 shrink-0 overflow-hidden">
      <img src={logos.escura} alt="" onError={() => setFailed(true)} className={`logo-light ${img}`} />
      <img src={logos.completa} alt="" onError={() => setFailed(true)} className={`logo-dark ${img}`} />
    </span>
  )
}

function Shell({ children, theme, toggle, box, slug, me, onSwitch, onLogout }) {
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-center gap-3">
            {slug && (
              <Link to={`/clientes/${slug}`} aria-label="Voltar para a página do box" className="rounded-full p-1.5 text-fg-muted hover:bg-card hover:text-fg">
                <ArrowLeft size={18} />
              </Link>
            )}
            {box && <BoxLogo box={box} />}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Agenda</div>
              <div className="truncate font-display text-lg font-bold uppercase leading-tight">{box?.name || 'DS Agende'}</div>
            </div>
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
          {me && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-line">
              <User size={15} className="text-highlight" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="truncate font-semibold">{me.name}</div>
                <div className="text-fg-subtle">{memberLabel(me)}</div>
              </div>
              {(me.role === 'owner' || me.role === 'coach') && (
                <Link to={`/clientes/${slug}/painel`} className="rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-on-accent hover:bg-accent-strong">
                  Painel
                </Link>
              )}
              {onSwitch && (
                <button onClick={onSwitch} className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-soft hover:bg-elevated">
                  Trocar
                </button>
              )}
              <button onClick={onLogout} aria-label="Sair" title="Sair" className="rounded-lg p-1.5 text-fg-muted hover:bg-elevated hover:text-fg">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </header>
        <main className="flex-1 px-4 pb-10 pt-4">{children}</main>
        <footer className="px-4 pb-4 text-center text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
          DS Agende • Double S Tech
        </footer>
      </div>
    </div>
  )
}

function CenterLoader() {
  return (
    <div className="flex justify-center py-16 text-fg-muted">
      <Loader2 className="animate-spin" size={24} aria-label="Carregando" />
    </div>
  )
}

function EmptyState({ title, text, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center ring-1 ring-line">
      <CalendarX2 size={28} className="text-fg-subtle" />
      <div className="font-display text-lg font-bold uppercase">{title}</div>
      {text && <p className="text-sm text-fg-muted">{text}</p>}
      {action}
    </div>
  )
}

/* ---------- login de teste ---------- */

function TestLogin({ box, onPick, onCancel, cancelLabel }) {
  const [people, setPeople] = useState(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    api.listTestPeople(box.id).then(setPeople, () => setPeople([]))
  }, [box.id])

  const digits = q.replace(/\D/g, '')
  const list = (people || []).filter((p) => !q || (digits ? p.phone_hint.endsWith(digits.slice(-4)) : p.name.toLowerCase().includes(q.toLowerCase())))

  const pick = async (p) => {
    setBusy(p.id)
    await onPick(p)
    setBusy(null)
  }

  if (people === null) return <CenterLoader />
  if (!box.test_login_enabled || people.length === 0) {
    return <EmptyState title="Login em breve" text="O acesso dos alunos ainda não foi liberado para este box." />
  }

  return (
    <section>
      <h1 className="font-display text-2xl font-bold uppercase">Quem vai treinar?</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Login de teste: escolha um aluno cadastrado para fazer reservas reais no banco.
      </p>
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 focus-within:border-accent/60">
        <Search size={16} className="text-fg-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome ou final do telefone"
          inputMode="search"
          className="w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        />
      </label>
      <ul className="mt-3 space-y-2">
        {list.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => pick(p)}
              disabled={busy != null}
              className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-line transition hover:ring-accent disabled:opacity-60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated font-display text-sm font-bold">
                {p.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block text-xs text-fg-subtle">
                  {p.role === 'aluno' ? `Plano ${PLAN_LABEL[p.plan] || '—'}` : p.role} · {p.phone_hint}
                </span>
              </span>
              {p.billing === 'bloqueado' && <Pill tone="err">Vencido</Pill>}
              {p.billing === 'carencia' && <Pill tone="warn">Carência</Pill>}
              {p.billing === 'pendente' && <Pill tone="warn">Pendente</Pill>}
              {busy === p.id && <Loader2 size={16} className="animate-spin text-fg-muted" />}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-sm text-fg-muted">Ninguém encontrado.</li>}
      </ul>
      {onCancel && (
        <button onClick={onCancel} className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-fg-soft hover:bg-card">
          {cancelLabel}
        </button>
      )}
    </section>
  )
}

/* ---------- agenda ---------- */

function Pill({ tone, children }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${TONE[tone]}`}>{children}</span>
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function Agenda({ box, me, notify, recurring, onOpenProfile }) {
  const days = useMemo(() => nextDays(7), [])
  const [day, setDay] = useState(days[0].key)
  const { rows, status, error, live, reload } = useAgenda(box.id, me.id, 7)
  const wods = useWods(box.id, days[0].key, days[days.length - 1].key)
  const [busy, setBusy] = useState(null) // session_id com ação em andamento
  const now = useNow()
  // situação do plano: sem plano liberado, "Reservar vaga" e "Entrar na fila" ficam travados
  const [plan, setPlan] = useState(null)
  const loadPlan = useCallback(() => {
    api.fetchMyPlanStatus(box.id).then(setPlan, () => {}) // falhou: o banco continua barrando a reserva
  }, [box.id])
  useEffect(() => {
    loadPlan()
  }, [loadPlan, me.id])
  const locked = plan ? !plan.can_book : false

  // aulas usadas na semana (limite do plano). Recarrega quando as reservas do aluno mudam
  // (ação na tela, promoção da fila, cancelamento pelo coach — chegam pelo Realtime).
  const [usage, setUsage] = useState([])
  const loadUsage = useCallback(() => {
    api.fetchMyWeekUsage(box.id).then(setUsage, () => {}) // falhou: só some o indicador
  }, [box.id])
  const myBookings = rows
    .filter((r) => r.my_booking_id)
    .map((r) => `${r.my_booking_id}:${r.my_booking_status}`)
    .join()
  useEffect(() => {
    loadUsage()
  }, [loadUsage, me.id, myBookings])

  const byDay = useMemo(() => {
    const m = {}
    for (const r of rows) (m[r.day] ||= []).push(r)
    return m
  }, [rows])
  const list = byDay[day] || []

  // limite da semana cheio: "Reservar vaga" abre a troca (escolher qual aula cancelar)
  const [swapFor, setSwapFor] = useState(null)
  const weekFull = (r) => {
    const w = usage.find((u) => u.week_start === mondayOf(r.day))
    return !!w && w.weekly_limit != null && w.used >= w.weekly_limit
  }

  const run = async (r, fn, { swapOnLimit = false } = {}) => {
    setBusy(r.session_id)
    const res = await fn()
    if (res.code === 'LIMITE_PLANO' && swapOnLimit) setSwapFor(r) // o contador estava desatualizado: oferece a troca
    else notify(res.message, res.ok ? 'ok' : 'err')
    if (res.code === 'PLANO_INATIVO') loadPlan() // a situação mudou desde que a tela abriu: mostra o aviso
    if (res.code === 'LIMITE_PLANO') loadUsage()
    await reload()
    setBusy(null)
  }

  const actions = {
    book: (r) =>
      weekFull(r)
        ? setSwapFor(r)
        : run(r, () => api.bookClass({ sessionId: r.session_id, personId: me.id }), { swapOnLimit: true }),
    swap: (r, cancelBookingId) => {
      setSwapFor(null)
      return run(r, () => api.swapBooking({ cancelBookingId, sessionId: r.session_id, personId: me.id }))
    },
    wait: (r) => run(r, () => api.joinWaitlist({ sessionId: r.session_id, personId: me.id })),
    cancel: (r) => run(r, () => api.cancelBooking({ bookingId: r.my_booking_id })),
    leave: (r) => run(r, () => api.leaveWaitlist({ sessionId: r.session_id })),
    // fixar a turma: o banco já reserva a semana (se o plano estiver ativo) → recarrega os dois
    fix: (r) =>
      run(r, async () => {
        const res = await api.fixSlot({ sessionId: r.session_id })
        if (res.ok) recurring.reload()
        return res
      }),
  }

  return (
    <section>
      <PlanBanner box={box} ps={plan} />
      <WelcomeBanner me={me} />
      {!locked && <WeekUsage usage={usage} day={day} />}
      {/* seletor de dias */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 scroll-thin">
        <div className="flex gap-2" role="tablist" aria-label="Dia da semana">
          {days.map((d) => {
            const active = d.key === day
            const mine = (byDay[d.key] || []).some((r) => r.my_booking_id || r.my_waitlist_pos)
            return (
              <button
                key={d.key}
                role="tab"
                aria-selected={active}
                onClick={() => setDay(d.key)}
                className={`relative flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 transition ${
                  active ? 'bg-accent text-on-accent shadow' : 'bg-card text-fg-soft ring-1 ring-line hover:bg-elevated'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">{d.offset === 0 ? 'Hoje' : WEEKDAYS[d.weekday]}</span>
                <span className="font-display text-xl font-bold leading-none">{d.day}</span>
                {mine && <span className={`mt-1 h-1.5 w-1.5 rounded-full ${active ? 'bg-on-accent' : 'bg-accent'}`} aria-label="tem reserva" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <Radio size={12} className={live === 'live' ? 'text-emerald-500' : live === 'error' ? 'text-rose-500' : 'text-fg-subtle'} />
          {live === 'live' ? 'Vagas ao vivo' : live === 'error' ? 'Sem tempo real — toque em Atualizar' : 'Conectando…'}
        </span>
        <button onClick={reload} className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-card hover:text-fg">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {status === 'loading' && <CenterLoader />}
        {status === 'error' && (
          <EmptyState
            title="Não foi possível carregar"
            text={error?.message}
            action={
              <button onClick={reload} className="mt-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
                Tentar de novo
              </button>
            }
          />
        )}
        {status === 'ready' && list.length === 0 && <EmptyState title="Sem aulas neste dia" text="Escolha outro dia na barra acima." />}
        {status === 'ready' &&
          list.map((r) => (
            <SessionCard
              key={r.session_id}
              r={r}
              wod={wods.get(r.day, r.modality_code)}
              now={now}
              box={box}
              busy={busy === r.session_id}
              disabled={busy != null}
              locked={locked}
              actions={actions}
              fixed={recurring.enabled ? recurring.byKey.get(slotKey(weekdayOf(r.day), r.start_time)) || null : undefined}
              onOpenProfile={onOpenProfile}
            />
          ))}
      </div>

      <SwapModal
        target={swapFor}
        rows={rows}
        usage={usage}
        now={now}
        box={box}
        onClose={() => setSwapFor(null)}
        onConfirm={(bookingId) => actions.swap(swapFor, bookingId)}
      />
    </section>
  )
}

/* ---------- troca de aula com o limite da semana cheio (migrations/20261204_troca_de_aula.sql) ---------- */

const fmtClass = (r) => {
  const [, m, d] = r.day.split('-')
  return `${WEEKDAYS[weekdayOf(r.day)]} ${d}/${m} · ${r.start_time} · ${r.modality_name || r.label || 'Aula'}`
}

/** Lista as reservas da mesma semana; só dá para trocar as que ainda estão no prazo de cancelamento. */
function SwapModal({ target, rows, usage, now, box, onClose, onConfirm }) {
  const [pick, setPick] = useState(null)
  useEffect(() => setPick(null), [target])
  if (!target) return null

  const week = mondayOf(target.day)
  const mine = rows
    .filter((r) => r.my_booking_status === 'reservado' && r.session_id !== target.session_id && mondayOf(r.day) === week)
    .map((r) => {
      const until = new Date(new Date(r.starts_at).getTime() - box.min_cancel_minutes * 60000)
      return { r, until, ok: now < until.getTime() }
    })
    .sort((a, b) => a.r.starts_at.localeCompare(b.r.starts_at))
  const anyOk = mine.some((m) => m.ok)
  const w = usage.find((u) => u.week_start === week)
  const hidden = w ? Math.max(0, w.used - mine.length) : 0 // reservas em dias que a agenda ainda não mostra

  return (
    <Modal
      open
      onClose={onClose}
      title="Limite da semana"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button onClick={onClose} className="flex-1 rounded-xl bg-card px-4 py-2.5 text-sm font-semibold text-fg ring-1 ring-line hover:bg-elevated">
            {anyOk ? 'Manter como está' : 'Entendi'}
          </button>
          {anyOk && (
            <button
              onClick={() => pick && onConfirm(pick)}
              disabled={!pick}
              className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              Trocar de aula
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3 text-sm text-fg-soft">
        <p>
          Você já tem{w ? ` ${w.used} de ${w.weekly_limit}` : ' todas as'} aulas reservadas nesta semana. Para reservar{' '}
          <b className="text-fg">{fmtClass(target)}</b>, cancele uma delas:
        </p>

        {mine.length > 0 && (
          <div role="radiogroup" aria-label="Aula para cancelar" className="space-y-2">
            {mine.map(({ r, until, ok }) => (
              <label
                key={r.my_booking_id}
                className={`flex items-center gap-3 rounded-xl p-3 ring-1 transition ${
                  !ok ? 'cursor-not-allowed opacity-50 ring-line' : pick === r.my_booking_id ? 'cursor-pointer bg-accent/10 ring-2 ring-accent' : 'cursor-pointer ring-line hover:bg-elevated'
                }`}
              >
                <input
                  type="radio"
                  name="swap"
                  aria-label={`Cancelar ${fmtClass(r)}`}
                  disabled={!ok}
                  checked={pick === r.my_booking_id}
                  onChange={() => setPick(r.my_booking_id)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-fg">{fmtClass(r)}</b>
                  <span className="text-xs text-fg-subtle">
                    {ok ? `Cancela sem perder o crédito até ${fmtTime(until)}` : 'Prazo de cancelamento encerrado'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {!anyOk && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200">
            Nenhuma das suas aulas desta semana pode mais ser cancelada sem perder o crédito. Fale com o box para um treino extra.
          </p>
        )}
        {hidden > 0 && (
          <p className="text-xs text-fg-subtle">
            {hidden === 1 ? 'Outra aula desta semana já passou' : `Outras ${hidden} aulas desta semana já passaram`} ou ainda não aparece{hidden === 1 ? '' : 'm'} na agenda, por isso não entra{hidden === 1 ? '' : 'm'} na troca.
          </p>
        )}
        {anyOk && <p className="text-xs text-fg-subtle">Se a aula nova lotar antes de você confirmar, nada muda: sua reserva antiga continua garantida.</p>}
      </div>
    </Modal>
  )
}

/* ---------- aulas usadas na semana (migrations/20261130_regras_plano.sql) ---------- */

// Segunda-feira da semana de um dia 'AAAA-MM-DD' (mesma conta do banco: seg a dom)
function mondayOf(key) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(d - ((dt.getUTCDay() + 6) % 7))
  return dt.toISOString().slice(0, 10)
}

/** "2 de 3 aulas usadas na semana", da semana do dia escolhido. Plano livre: nada. */
function WeekUsage({ usage, day }) {
  const w = usage.find((u) => u.week_start === mondayOf(day))
  if (!w || w.weekly_limit == null) return null
  const full = w.used >= w.weekly_limit
  const current = w.week_start === usage[0]?.week_start
  const when = current ? 'na semana' : `na semana de ${fmtDay(w.week_start)}`
  return (
    <div role="status" className={`mb-3 flex items-center gap-2 text-xs ${full ? 'text-amber-700 dark:text-amber-300' : 'text-fg-muted'}`}>
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: Math.min(w.weekly_limit, 7) }, (_, i) => (
          <span key={i} className={`h-1.5 w-4 rounded-full ${i < w.used ? (full ? 'bg-amber-500' : 'bg-accent') : 'bg-line'}`} />
        ))}
      </span>
      <span>
        <b className="font-semibold text-fg">
          {Math.min(w.used, w.weekly_limit)} de {w.weekly_limit}
        </b>{' '}
        aulas usadas {when}
        {full && ' · limite atingido'}
      </span>
    </div>
  )
}

function SessionCard({ r, wod, now, box, busy, disabled, locked, actions, fixed, onOpenProfile }) {
  const st = sessionState(r, now)
  const start = new Date(r.starts_at)
  const end = new Date(start.getTime() + r.duration_min * 60000)
  const cancelUntil = new Date(start.getTime() - box.min_cancel_minutes * 60000)
  const pct = Math.min(100, (r.booked_count / r.capacity) * 100)
  const bar = pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-accent'
  const color = r.modality_color || 'var(--color-accent)'
  const free = Math.max(0, r.capacity - r.booked_count)

  return (
    <article className={`relative overflow-hidden rounded-2xl bg-card ring-1 ring-line ${st.tone === 'muted' ? 'opacity-70' : ''}`}>
      {/* borda na cor da modalidade (CROSS é branco: o contorno mantém visível no tema claro) */}
      <span className="absolute inset-y-0 left-0 w-1.5 ring-1 ring-inset ring-fg/15" style={{ backgroundColor: color }} aria-hidden="true" />
      <div className="py-3 pl-5 pr-4">
        <div className="flex items-start gap-3">
          <div className="w-16 shrink-0">
            <div className="font-display text-2xl font-bold leading-none">{r.start_time}</div>
            <div className="mt-1 text-[11px] text-fg-subtle">até {fmtTime(end)}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-display text-base font-bold uppercase tracking-wide">{r.label || r.modality_name || 'Aula'}</span>
              {r.label && r.modality_name && <span className="text-[11px] font-semibold uppercase text-fg-subtle">{r.modality_name}</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-fg-muted">
              <span className="flex items-center gap-1">
                <User size={12} /> {r.coach_name || 'Coach a definir'}
              </span>
              {r.level !== 'misto' && <span>{LEVEL_LABEL[r.level]}</span>}
            </div>
          </div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs text-fg-muted">
            <span className="flex items-center gap-1">
              <Users size={12} />
              <b className="font-display text-base text-fg">{r.booked_count}</b>/{r.capacity} vagas
            </span>
            <span>
              {free > 0 ? `${free} livre${free > 1 ? 's' : ''}` : r.waitlist_count > 0 ? `${r.waitlist_count} na fila` : 'sem vagas'}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div className={`h-full rounded-full ${bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {wod && !r.cancelled && <WodPanel wod={wod} />}

        <CardAction st={st} r={r} busy={busy} disabled={disabled} locked={locked} actions={actions} cancelUntil={cancelUntil} now={now} />
        {/* fixed: undefined = não se aplica (visitante/drop-in/equipe); null = ainda não fixado */}
        {fixed !== undefined && !r.cancelled && <FixSlot r={r} fixed={fixed} disabled={disabled} onFix={actions.fix} onOpenProfile={onOpenProfile} />}
      </div>
    </article>
  )
}

/** Treino do Dia da aula (data + modalidade), recolhido por padrão para a lista ficar enxuta. */
function WodPanel({ wod }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 rounded-xl bg-elevated/60 ring-1 ring-line">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Dumbbell size={14} className="shrink-0 text-highlight" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-fg-subtle">Treino do dia</span>
          <span className="block truncate font-display text-sm font-bold uppercase">{wod.title}</span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-fg-muted">{open ? 'Fechar' : 'Ver treino'}</span>
        <ChevronDown size={15} className={`shrink-0 text-fg-subtle transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          {wod.description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-fg-soft">{wod.description}</p>
          ) : (
            <p className="text-sm text-fg-subtle">O coach explica os detalhes na aula.</p>
          )}
        </div>
      )}
    </div>
  )
}

// Opção discreta no rodapé do card: fixar a turma (dia da semana + horário) toda semana
function FixSlot({ r, fixed, disabled, onFix, onOpenProfile }) {
  if (fixed) {
    return (
      <button
        onClick={onOpenProfile}
        className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-accent-strong hover:underline"
        title="Gerenciar no Perfil"
      >
        <Pin size={11} className="fill-current" /> Horário fixo toda semana
      </button>
    )
  }
  return (
    <button
      onClick={() => onFix(r)}
      disabled={disabled}
      className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] text-fg-subtle hover:text-fg disabled:opacity-50"
    >
      <Pin size={11} /> Fixar este horário toda semana
    </button>
  )
}

/* Cancelamento dentro do prazo do box (min_cancel_minutes): o banco registra 'late_cancel' —
   a vaga vai para a fila, mas a aula continua contando no limite semanal do plano. */
function LateCancelModal({ open, cancelUntil, r, onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancelar em cima da hora?"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button onClick={onClose} className="flex-1 rounded-xl bg-card px-4 py-2.5 text-sm font-semibold text-fg ring-1 ring-line hover:bg-elevated">
            Manter reserva
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">
            Cancelar mesmo assim
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-fg-soft">
        <p>
          O prazo para cancelar a aula das <b className="text-fg">{r.start_time}</b> sem perder o crédito terminou às{' '}
          <b className="text-fg">{fmtTime(cancelUntil)}</b>.
        </p>
        <p className="rounded-xl bg-amber-500/10 p-3 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200">
          Se cancelar agora, sua vaga vai para a lista de espera, mas <b>esta aula continua contando no limite de aulas da sua semana</b>.
        </p>
      </div>
    </Modal>
  )
}

function CardAction({ st, r, busy, disabled, locked, actions, cancelUntil, now }) {
  const [confirmLate, setConfirmLate] = useState(false)
  const btn = 'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50'
  const spin = busy && <Loader2 size={16} className="animate-spin" />

  // sem plano liberado: reservar e entrar na fila ficam travados (cancelar e sair da fila continuam)
  if (locked && (st.key === 'disponivel' || (st.key === 'lotada' && !st.started))) {
    return (
      <button disabled aria-disabled="true" title="Você precisa de um plano ativo para agendar aulas." className={`${btn} bg-elevated text-fg-muted ring-1 ring-line`}>
        <Lock size={14} /> Plano necessário
      </button>
    )
  }

  if (st.key === 'inscrito') {
    // depois do início o banco não aceita mais cancelar (AULA_ENCERRADA): quem não foi fica com falta
    if (now >= new Date(r.starts_at).getTime()) {
      return (
        <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-fg-subtle">
          <Clock size={11} /> Aula em andamento — não dá mais para cancelar
        </p>
      )
    }
    const late = now > cancelUntil.getTime()
    return (
      <>
        <button onClick={() => (late ? setConfirmLate(true) : actions.cancel(r))} disabled={disabled} className={`${btn} bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/30 hover:bg-rose-500/20 dark:text-rose-300`}>
          {spin} Cancelar reserva
        </button>
        <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-fg-subtle">
          <Clock size={11} />
          {late ? 'Cancelar agora consome o crédito da semana' : `Cancelamento sem perder o crédito até ${fmtTime(cancelUntil)}`}
        </p>
        <LateCancelModal
          open={confirmLate}
          cancelUntil={cancelUntil}
          r={r}
          onClose={() => setConfirmLate(false)}
          onConfirm={() => {
            setConfirmLate(false)
            actions.cancel(r)
          }}
        />
      </>
    )
  }
  if (st.key === 'fila') {
    return (
      <button onClick={() => actions.leave(r)} disabled={disabled} className={`${btn} bg-elevated text-fg-soft ring-1 ring-line hover:text-fg`}>
        {spin} Sair da lista de espera
      </button>
    )
  }
  if (st.key === 'disponivel') {
    return (
      <button onClick={() => actions.book(r)} disabled={disabled} className={`${btn} bg-accent text-on-accent hover:bg-accent-strong`}>
        {spin} Reservar vaga
      </button>
    )
  }
  if (st.key === 'lotada' && !st.started) {
    return (
      <button onClick={() => actions.wait(r)} disabled={disabled} className={`${btn} bg-card text-fg ring-1 ring-line-strong hover:bg-elevated`}>
        {spin} Entrar na fila de espera
      </button>
    )
  }
  return null
}

