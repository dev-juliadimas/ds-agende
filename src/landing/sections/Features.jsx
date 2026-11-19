// 4. Funcionalidades em Bento Grid — cards de tamanhos variados (alguns ocupam 2 colunas no desktop),
// cada um com uma mini-ilustração viva. O bot fica em marrom; o financeiro mostra o cronômetro do Pix.
import { useEffect, useState } from 'react'
import { MessageCircle, ShieldCheck, Timer } from 'lucide-react'
import { FEATURES } from '../data'
import { FeatureIcon, Reveal, Section, SectionTitle, useInView } from '../ui'

/* ── Mini-ilustrações (decorativas: aria-hidden) ── */

// Conversa curta com o bot
function ChatVisual() {
  const lines = [
    { me: false, text: 'Oi! Quer agendar para quando?' },
    { me: true, text: 'Sábado de manhã' },
    { me: false, text: 'Tenho 09:00 e 10:30. Qual prefere?' },
  ]
  return (
    <div className="mt-6 space-y-2 rounded-2xl bg-nevoa/10 p-4" aria-hidden>
      {lines.map((l, i) => (
        <p
          key={i}
          className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
            l.me ? 'ml-auto rounded-tr-md bg-ambar text-ink' : 'rounded-tl-md bg-nevoa/90 text-raiz'
          }`}
        >
          {l.text}
        </p>
      ))}
    </div>
  )
}

// Pré-reserva: o horário fica segurado por 15 minutos enquanto o Pix não cai (o relógio corre de verdade)
function TimerVisual() {
  const [ref, inView] = useInView()
  const [left, setLeft] = useState(15 * 60 - 1)
  useEffect(() => {
    if (!inView) return
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 15 * 60 - 1 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [inView])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const pct = (left / (15 * 60)) * 100
  return (
    <div ref={ref} className="mt-6 rounded-2xl bg-nevoa-deep p-4 ring-1 ring-line" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Sáb 14:00 • Penteado</p>
          <p className="text-xs text-muted">Pré-reservado, aguardando sinal</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-raiz px-3 py-1.5 font-display text-sm tabular-nums text-nevoa">
          <Timer className="size-4 text-ambar" strokeWidth={1.75} /> {mm}:{ss}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-ambar transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Clientes que sumiram, com o atalho para chamar no WhatsApp
function RetentionVisual() {
  const people = [
    { name: 'Bruna', days: 32 },
    { name: 'Rafael', days: 45 },
  ]
  return (
    <ul className="mt-6 space-y-2" aria-hidden>
      {people.map((p) => (
        <li key={p.name} className="flex items-center gap-3 rounded-xl bg-nevoa-deep px-3 py-2 ring-1 ring-line">
          <span className="grid size-8 place-items-center rounded-full bg-raiz font-display text-sm text-ambar">{p.name[0]}</span>
          <span className="min-w-0 flex-1 text-xs">
            <b className="block text-sm text-raiz">{p.name}</b>
            <span className="text-muted">{p.days} dias sem vir</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-ambar px-2.5 py-1 text-[11px] font-bold text-ink transition duration-300 group-hover/card:-translate-y-0.5">
            <MessageCircle className="size-3" /> Chamar
          </span>
        </li>
      ))}
    </ul>
  )
}

// Horários mais procurados (as barras crescem quando o card aparece)
function ChartVisual() {
  const bars = [
    { h: '07h', v: 55 }, { h: '09h', v: 80 }, { h: '12h', v: 35 }, { h: '15h', v: 50 },
    { h: '18h', v: 100 }, { h: '19h', v: 90 }, { h: '20h', v: 60 },
  ]
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" aria-hidden>
      <div className="flex h-32 items-end gap-2 rounded-2xl bg-nevoa-deep p-4 ring-1 ring-line">
        {bars.map((b, i) => (
          <div key={b.h} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div
              className={`bar-grow w-full rounded-md ${
                b.v === 100 ? 'bg-ambar' : 'bg-raiz/80 group-hover/card:bg-raiz'
              }`}
              style={{ height: `${b.v}%`, transitionDelay: `${i * 70}ms` }}
            />
            <span className="text-[10px] text-muted">{b.h}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 sm:flex-col">
        <p className="flex-1 rounded-2xl bg-raiz px-4 py-3 text-nevoa">
          <span className="block text-[11px] text-nevoa/70">Taxa de faltas</span>
          <span className="font-display text-2xl">3%</span>
        </p>
        <p className="flex-1 rounded-2xl bg-nevoa-deep px-4 py-3 ring-1 ring-line">
          <span className="block text-[11px] text-muted">Pico</span>
          <span className="font-display text-2xl">18h</span>
        </p>
      </div>
    </div>
  )
}

const VISUALS = { chat: ChatVisual, timer: TimerVisual, retention: RetentionVisual, chart: ChartVisual }

function FeatureCard({ icon, title, text, note, tags, dark, visual }) {
  const Visual = VISUALS[visual]
  return (
    <article
      className={`group/card relative flex h-full flex-col overflow-hidden rounded-3xl p-7 ring-1 transition duration-300 hover:-translate-y-1 sm:p-8 ${
        dark
          ? 'bg-raiz text-nevoa ring-raiz hover:ring-ambar hover:shadow-[0_30px_60px_-30px_rgba(71,36,21,.9)]'
          : 'bg-card ring-line hover:ring-ambar hover:shadow-[0_24px_48px_-28px_rgba(71,36,21,.55)]'
      }`}
    >
      {/* brilho âmbar que aparece no hover */}
      <span
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-ambar/0 blur-3xl transition duration-500 group-hover/card:bg-ambar/25"
        aria-hidden
      />
      <div className="relative flex items-start gap-5">
        <FeatureIcon icon={icon} tone={dark ? 'onDark' : 'solid'} />
        <div>
          <h3 className="font-display text-xl leading-snug">{title}</h3>
          <p className={`mt-2 text-sm leading-relaxed ${dark ? 'text-nevoa/80' : 'text-muted'}`}>{text}</p>
        </div>
      </div>

      {note && (
        <p className="relative mt-6 flex gap-3 rounded-2xl bg-nevoa/10 p-4 text-sm leading-relaxed text-nevoa">
          <ShieldCheck className="size-5 shrink-0 text-ambar" strokeWidth={1.75} aria-hidden />
          {note}
        </p>
      )}
      {Visual && <div className="relative"><Visual /></div>}

      <div className="relative mt-auto flex flex-wrap gap-2 pt-6">
        {tags.map((t) => (
          <span
            key={t}
            className={`rounded-full px-3 py-1 text-xs ${dark ? 'bg-nevoa/10 text-nevoa/90' : 'bg-nevoa-deep text-muted'}`}
          >
            {t}
          </span>
        ))}
      </div>
    </article>
  )
}

export default function Features() {
  return (
    <Section id="funcionalidades" className="bg-nevoa-deep">
      <SectionTitle
        kicker="Funcionalidades"
        title="O que trabalha por você enquanto você atende"
        text="Cada função pode ser testada na demonstração, com o passo a passo ao lado."
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 2) * 100} className={f.span ? 'md:col-span-2' : ''}>
            <FeatureCard {...f} />
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
