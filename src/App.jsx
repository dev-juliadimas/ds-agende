import { useEffect, useRef, useState } from 'react'
import { Award, CalendarDays, CreditCard, LayoutDashboard, Megaphone, MapPin, RotateCcw, Radio, Smartphone, MessageCircle, Clock } from 'lucide-react'
import { DAYS, fromMin, toMin } from './lib/constants'
import { checkinGPS, expireHolds, fmtDist, getState, gpsCheck, myBookings, resetDemo, rotateQR, setGps, setNow, useDB } from './lib/store'
import { Logo, ThemeToggle, Toasts } from './components/ui'
import { useTheme } from './lib/theme'
import Agenda from './screens/Agenda'
import Avisos from './screens/Avisos'
import Conquistas, { Celebration } from './screens/Conquistas'
import CoachPanel from './screens/coach/CoachPanel'
import WhatsApp from './screens/WhatsApp'
import Planos from './screens/Planos'
import DemoGuide, { GuideButton } from './components/DemoGuide'

const NAV = [
  { k: 'agenda', l: 'Agenda', i: CalendarDays },
  { k: 'avisos', l: 'Avisos', i: Megaphone },
  { k: 'conquistas', l: 'Conquistas', i: Award },
  { k: 'planos', l: 'Planos', i: CreditCard },
  { k: 'coach', l: 'Gestão', i: LayoutDashboard },
]
const TIMES = ['05:50', '06:05', '07:55', '11:55', '16:20', '18:25', '20:00', '21:30']

function Footer() {
  return (
    <div className="px-5 pb-4 pt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
      Desenvolvido por <span className="text-fg-muted">Double S Tech</span> • DS Agende
    </div>
  )
}

// Estilo Wellhub: ao chegar perto do box, na janela da aula, o check-in aparece sozinho
function NearbyCheckin({ db }) {
  const [dismissed, setDismissed] = useState({})
  const [err, setErr] = useState('')
  const b = myBookings(db).find((x) => {
    if (x.status !== 'reservado' || dismissed[x.id]) return false
    const g = gpsCheck(db, x)
    return g.inRadius && g.inWindow
  })
  if (!b) return null
  const g = gpsCheck(db, b)
  return (
    <div className="absolute inset-x-3 bottom-20 z-[45] animate-slideup">
      <div className="rounded-2xl bg-card/95 p-3 text-fg shadow-2xl ring-1 ring-line backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
            <MapPin size={22} />
            <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-emerald-500" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Você chegou • {fmtDist(g.dist)} do box</div>
            <div className="font-display text-xl font-extrabold uppercase leading-tight">Fazer check-in?</div>
            <div className="text-xs text-fg-subtle">
              {DAYS.find((d) => d.key === b.slot.day).label} {b.slot.time} • {b.slot.coach}
            </div>
          </div>
        </div>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button
            onClick={() => {
              const r = checkinGPS(b.id)
              if (!r.ok) setErr(r.msg)
            }}
            className="rounded-xl bg-ink py-2.5 text-sm font-bold text-ambar active:scale-[.98]"
          >
            ✓ Fazer check-in
          </button>
          <button onClick={() => setDismissed((d) => ({ ...d, [b.id]: true }))} className="rounded-xl px-3 text-xs font-semibold text-fg-subtle hover:bg-elevated">
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}

function PhoneFrame({ children, className = '', dark = true }) {
  return (
    <div className={`relative h-full w-full overflow-hidden lg:h-[800px] lg:w-[390px] lg:rounded-[46px] lg:border-[10px] lg:border-raiz lg:shadow-2xl lg:shadow-ink/40 ${dark ? 'bg-canvas text-fg' : 'bg-white'} ${className}`}>
      <div className="pointer-events-none absolute left-1/2 top-2 z-[60] hidden h-6 w-28 -translate-x-1/2 rounded-full bg-black lg:block" />
      {children}
    </div>
  )
}

function StatusBar({ db }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between px-6 text-[11px] font-semibold">
      <span>{fromMin(db.now.min)}</span>
      <span className="flex items-center gap-1 text-fg-muted">
        <MapPin size={11} className={db.gpsInside ? 'text-highlight' : ''} /> 5G ▮▮▮
      </span>
    </div>
  )
}

export default function App() {
  const db = useDB()
  const { theme, toggle: toggleTheme } = useTheme()
  const [tab, setTab] = useState('agenda')
  const [coachTab, setCoachTab] = useState('turmas')
  const [pane, setPane] = useState('app') // mobile: app | wa | log
  const [guide, setGuide] = useState(false)
  const nav = (t) => setTab(t)
  const goGuide = ({ tab: t, coachTab: ct, pane: p }) => {
    if (t) setTab(t)
    if (ct) setCoachTab(ct)
    setPane(p || 'app')
  }
  const scroller = useRef(null)
  const seen = useRef(0)
  const waCount = db.chats.me.messages.filter((m) => m.from === 'bot').length + db.chats.visitor.messages.filter((m) => m.from === 'bot').length
  if (pane === 'wa') seen.current = waCount
  const unread = Math.max(0, waCount - seen.current)

  // QR dinâmico: renova o token automaticamente a cada 30 s enquanto estiver ativo
  useEffect(() => {
    const i = setInterval(() => {
      const q = getState().qr
      if (q && Date.now() - q.issuedAt >= q.ttl * 1000) rotateQR(q.slotId)
      expireHolds() // pré-reservas de 15 min sem pagamento
    }, 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [tab])

  const appPhone = (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <StatusBar db={db} />
        <div ref={scroller} className="flex-1 overflow-y-auto scroll-thin">
          {tab === 'agenda' && <Agenda db={db} nav={nav} />}
          {tab === 'avisos' && <Avisos db={db} />}
          {tab === 'conquistas' && <Conquistas db={db} />}
          {tab === 'planos' && <Planos db={db} nav={nav} />}
          {tab === 'coach' && <CoachPanel db={db} tab={coachTab} setTab={setCoachTab} />}
          <Footer />
        </div>
        <nav className="grid shrink-0 grid-cols-5 border-t border-line bg-surface pb-3 pt-2">
          {NAV.map(({ k, l, i: Icon }) => (
            <button key={k} onClick={() => setTab(k)} className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${tab === k ? 'text-highlight' : 'text-fg-subtle'}`}>
              <span className={`rounded-full px-3 py-1 ${tab === k ? 'bg-accent/15' : ''}`}>
                <Icon size={20} />
              </span>
              {l}
            </button>
          ))}
        </nav>
      </div>
      {tab !== 'coach' && <NearbyCheckin db={db} />}
      <Celebration db={db} />
      <Toasts toasts={db.toasts} />
    </PhoneFrame>
  )

  const waPhone = (
    <PhoneFrame dark={false}>
      <WhatsApp db={db} />
    </PhoneFrame>
  )

  const log = (
    <div className="flex h-full flex-col rounded-3xl bg-surface p-4 ring-1 ring-line lg:h-[800px] lg:w-[300px]">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
        <Radio size={14} className="animate-pulse text-highlight" /> Supabase Realtime
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">Cada evento abaixo é uma escrita no mesmo banco — app e bot se atualizam juntos.</p>
      <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto scroll-thin">
        {!db.events.length && <p className="text-[11px] text-fg-subtle">Aguardando eventos… faça uma reserva no app ou no WhatsApp.</p>}
        {db.events.map((e) => (
          <div key={e.id} className="animate-slideup rounded-xl bg-card px-3 py-2 text-[11px] ring-1 ring-line">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-px text-[9px] font-bold uppercase ${
                  { web: 'bg-accent/20 text-highlight', whatsapp: 'bg-emerald-500/20 text-emerald-300', coach: 'bg-sky-500/20 text-sky-300', sistema: 'bg-fuchsia-500/20 text-fuchsia-300' }[e.source] || 'bg-elevated text-fg-soft'
                }`}
              >
                {e.source === 'web' ? 'app' : e.source}
              </span>
              <span className="text-fg-subtle">{e.ts}</span>
            </div>
            <span className="text-fg-soft">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Barra de controle da demonstração */}
      <header className="z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Logo className="h-9 w-auto" alt="" />
          <div className="leading-tight">
            <div className="font-display text-lg font-extrabold uppercase tracking-wide">DS Agende</div>
            <div className="hidden text-[10px] text-fg-subtle sm:block">Protótipo interativo • Box de CrossFit</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-fg-subtle">
            <Clock size={13} /> Simular:
          </span>
          <select className="rounded-lg bg-card px-2 py-1 ring-1 ring-line" value={db.now.day} onChange={(e) => setNow({ ...db.now, day: e.target.value })}>
            {DAYS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label} {d.date.slice(8)}/{d.date.slice(5, 7)}
              </option>
            ))}
          </select>
          <select className="rounded-lg bg-card px-2 py-1 ring-1 ring-line" value={fromMin(db.now.min)} onChange={(e) => setNow({ ...db.now, min: toMin(e.target.value) })}>
            {[...new Set([...TIMES, fromMin(db.now.min)])].sort().map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 ring-1 ring-line">
            <input type="checkbox" className="accent-accent" checked={db.gpsInside} onChange={(e) => setGps(e.target.checked)} />
            <MapPin size={12} /> No box (GPS)
          </label>
          <button onClick={resetDemo} className="flex items-center gap-1 rounded-lg px-2 py-1 text-fg-muted hover:bg-card hover:text-fg">
            <RotateCcw size={12} /> Reiniciar demo
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <GuideButton onClick={() => setGuide(true)} />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      {/* Alternância mobile */}
      <div className="grid grid-cols-3 gap-1 bg-surface p-1.5 lg:hidden">
        {[
          ['app', 'App', Smartphone],
          ['wa', 'WhatsApp', MessageCircle],
          ['log', 'Realtime', Radio],
        ].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setPane(k)} className={`relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold ${pane === k ? 'bg-accent text-ink' : 'bg-card text-fg-muted'}`}>
            <Icon size={14} /> {l}
            {k === 'wa' && unread > 0 && <span className="absolute right-2 top-1 h-4 min-w-4 rounded-full bg-wa-light px-1 text-[10px] font-bold text-white">{unread}</span>}
          </button>
        ))}
      </div>

      <main className="flex min-h-0 flex-1 items-center justify-center gap-6 overflow-auto lg:p-6">
        <div className={`h-full w-full lg:block lg:h-auto lg:w-auto ${pane === 'app' ? 'block' : 'hidden'}`}>{appPhone}</div>
        <div className={`h-full w-full lg:block lg:h-auto lg:w-auto ${pane === 'wa' ? 'block' : 'hidden'}`}>{waPhone}</div>
        <div className={`h-full w-full p-3 lg:p-0 xl:block lg:h-auto lg:w-auto ${pane === 'log' ? 'block lg:hidden' : 'hidden'}`}>{log}</div>
      </main>
      <DemoGuide open={guide} onClose={() => setGuide(false)} onGo={goGuide} />
    </div>
  )
}
