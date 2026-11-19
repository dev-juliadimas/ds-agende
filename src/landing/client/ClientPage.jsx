/*
 * Página pública de um cliente (rota /clientes/:slug), aberta pelo card da vitrine "Eles já usam".
 * Fala sobre o box, as modalidades, a grade de horários e os planos.
 *
 * Os dados vêm de src/lib/boxPresets.js (os mesmos do script SQL do box).
 * O visual reaproveita as peças da landing (ui.jsx) trocando os tokens de cor
 * pelas cores do cliente: tudo que é "raiz" vira a primária e "âmbar" a secundária.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Check, Clock, Dumbbell, MapPin, MessageCircle, Smartphone } from 'lucide-react'
import { PRESETS } from '../../lib/boxPresets'
import { DAYS, brl } from '../../lib/constants'
import { boxAsset, boxLogos, ensureContrast, mix } from '../../lib/brand'
import { CtaLink, Kicker, PillToggle, Reveal, Section, SectionTitle } from '../ui'

/* ---------- cores do cliente nos tokens da landing ---------- */
function clientTheme(primary, secondary) {
  const nevoa = mix('#ffffff', primary, 0.035)
  const deep = mix('#ffffff', primary, 0.07)
  const lightBgs = [nevoa, deep, '#ffffff']
  return {
    '--color-raiz': primary,
    '--color-ambar': secondary,
    '--color-ambar-hover': mix(secondary, '#000000', 0.12),
    '--color-nevoa': nevoa,
    '--color-nevoa-deep': deep,
    '--color-card': '#ffffff',
    '--color-line': mix('#ffffff', primary, 0.14),
    '--color-muted': ensureContrast(mix(primary, '#ffffff', 0.3), lightBgs),
    '--color-highlight': ensureContrast(secondary, lightBgs),
    '--color-ink': primary,
    '--font-display': '"Montserrat", "Arimo", ui-sans-serif, sans-serif',
  }
}

// Marcador de cor da modalidade (CROSS é branco: o contorno garante que apareça)
const Dot = ({ color, className = 'size-2.5' }) => (
  <span className={`inline-block shrink-0 rounded-full ring-1 ring-black/20 ${className}`} style={{ backgroundColor: color }} aria-hidden />
)

// Logo do Storage; se o arquivo faltar, cai no monograma
function BoxLogo({ box, kind, className, fallbackClass }) {
  const [broken, setBroken] = useState(false)
  if (box.boxId && !broken) {
    return <img src={boxLogos(box.boxId)[kind]} alt={box.name} onError={() => setBroken(true)} className={className} />
  }
  return (
    <span className={`grid place-items-center rounded-xl bg-ambar font-display font-extrabold tracking-wider text-raiz ${fallbackClass}`}>{box.monogram}</span>
  )
}

// Favos de hexágono (o desenho da logo) como textura de fundo
const honeycomb = (color) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='97' viewBox='0 0 56 97'><path d='M28 1 54 16v30L28 61 2 46V16Zm0 61v34' fill='none' stroke='${color}' stroke-width='2'/></svg>`,
  )}")`

// Textura do box: a imagem do Storage (box.pattern) ou, sem ela, os favos desenhados acima
// `strength`: opacidade da textura (a imagem tem traço mais grosso que os favos desenhados)
const patternStyle = (box, strength) =>
  box.pattern && box.boxId
    ? { backgroundImage: `url("${boxAsset(box.boxId, box.pattern)}")`, backgroundSize: '420px', opacity: strength }
    : { backgroundImage: honeycomb(box.secondary), opacity: strength * 0.6 }

/* ---------- topo fixo ---------- */
function TopBar({ box }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-raiz/90 text-nevoa backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#inicio" className="flex min-w-0 items-center gap-2.5">
          <BoxLogo box={box} kind="icone" className="size-10 shrink-0 scale-125 object-contain" fallbackClass="size-10 shrink-0 text-sm" />
          <span className="truncate font-display text-base font-extrabold uppercase tracking-wide">{box.name}</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-nevoa/80 md:flex" aria-label="Seções">
          <a href="#modalidades" className="hover:text-ambar">Modalidades</a>
          <a href="#horarios" className="hover:text-ambar">Horários</a>
          <a href="#planos" className="hover:text-ambar">Planos</a>
        </nav>
        <a href="#planos" className="shrink-0 rounded-full bg-ambar px-4 py-2 text-sm font-bold text-raiz transition hover:bg-ambar-hover">
          Ver planos
        </a>
      </div>
    </header>
  )
}

/* ---------- 1. apresentação ---------- */
function Hero({ box, stats }) {
  const wa = box.page.whatsapp
  return (
    <section id="inicio" className="relative overflow-hidden bg-raiz text-nevoa">
      {/* estampa do box (Storage), sumindo para a esquerda */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_left,black_35%,transparent_95%)]"
        style={patternStyle(box, 0.35)}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1fr_380px]">
       <div>
        <Reveal>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-nevoa/90 ring-1 ring-white/15">
            <MapPin className="size-3.5 text-ambar" aria-hidden /> {box.city}
          </span>
          <h1 className="mt-5 max-w-3xl font-display text-[2.6rem] font-extrabold uppercase leading-[.95] tracking-tight sm:text-7xl">
            {box.name}
          </h1>
          <p className="mt-4 font-display text-lg font-bold uppercase tracking-wide text-ambar sm:text-2xl">{box.page.tagline}</p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-nevoa/80 sm:text-lg">{box.page.about}</p>
        </Reveal>

        <Reveal delay={120} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <CtaLink href="#horarios" icon={CalendarDays}>Ver horários</CtaLink>
          {wa ? (
            <CtaLink
              href={`https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Vi a página do ${box.name} e quero agendar uma aula experimental.`)}`}
              external
              variant="light"
              icon={MessageCircle}
            >
              Agendar aula experimental
            </CtaLink>
          ) : (
            <CtaLink to={`/demo?box=${box.slug}`} variant="light" icon={Smartphone}>
              Abrir o app do box
            </CtaLink>
          )}
        </Reveal>

        <Reveal delay={200} as="dl" className="mt-12 grid max-w-2xl grid-cols-3 gap-3">
          {stats.map(([n, l]) => (
            <div key={l} className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <dt className="sr-only">{l}</dt>
              <dd className="font-display text-3xl font-extrabold text-ambar sm:text-4xl">{n}</dd>
              <dd className="text-xs text-nevoa/70 sm:text-sm">{l}</dd>
            </div>
          ))}
        </Reveal>
       </div>
        {/* logo completa ao lado (só em tela grande) */}
        <Reveal delay={150} className="hidden lg:block">
          <BoxLogo box={box} kind="completa" className="w-full drop-shadow-[0_20px_40px_rgba(0,0,0,.35)]" fallbackClass="aspect-square w-full text-8xl" />
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- 2. modalidades ---------- */
function Modalities({ box, perWeek }) {
  return (
    <Section id="modalidades">
      <SectionTitle kicker="Modalidades" title="Escolha o seu treino" text="Cada aula da grade tem uma modalidade. A cor ajuda a achar a sua nos horários." />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(box.modalities).map(([k, m], i) => (
          <Reveal as="li" key={k} delay={i * 60} className="group/card flex flex-col rounded-3xl bg-card p-6 ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:ring-ambar">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-12 place-items-center rounded-xl bg-raiz">
                <Dot color={m.color} className="size-4" />
              </span>
              <span className="text-xs font-semibold text-muted">
                {perWeek[k] ? `${perWeek[k]} ${perWeek[k] === 1 ? 'aula' : 'aulas'} por semana` : 'Dentro das turmas STRONG/CROSS'}
              </span>
            </div>
            <h3 className="mt-5 font-display text-2xl font-extrabold uppercase tracking-wide">{m.label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{m.desc}</p>
          </Reveal>
        ))}
      </ul>
    </Section>
  )
}

/* ---------- 3. horários ---------- */
// Borda do card de horário por modalidade (o amarelo é o `ambar` do box, o mesmo do botão e da bolinha).
// Modalidade sem entrada aqui fica com o contorno neutro.
const SLOT_BORDER = {
  CROSS: 'border-l-2 border-white/40 ring-white/15 hover:border-white/80 hover:ring-white/35',
  HYROX: 'border-l-2 border-ambar/70 ring-ambar/35 hover:border-ambar hover:ring-ambar/70',
  STRONG_CROSS: 'border-l-2 border-white/70 ring-ambar/45 hover:border-white hover:ring-ambar/80',
  AULAO:
    'border-l-2 border-ambar ring-ambar/60 shadow-[0_0_18px_-6px_var(--color-ambar)] hover:ring-ambar hover:shadow-[0_0_24px_-4px_var(--color-ambar)]',
}
const SLOT_BORDER_DEFAULT = 'border-l-2 border-white/15 ring-white/10 hover:border-white/40 hover:ring-white/25'

function DayColumn({ box, day }) {
  const list = box.grade[day.key] || []
  return (
    <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[.2em] text-ambar">{day.label}</h3>
      <ul className="space-y-1.5">
        {list.map(([t, code]) => {
          const m = box.modalities[code]
          return (
            <li
              key={t}
              className={`flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 ring-1 transition duration-200 lg:flex-col lg:items-start lg:gap-0.5 ${SLOT_BORDER[code] || SLOT_BORDER_DEFAULT}`}
            >
              <span className="font-display text-lg font-extrabold tabular-nums">{t}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Dot color={m.color} className="size-2" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-nevoa/85">{m.label}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Schedule({ box }) {
  const [day, setDay] = useState('seg')
  const options = DAYS.map((d) => ({ key: d.key, label: d.short }))
  const used = Object.entries(box.modalities).filter(([k]) => Object.values(box.grade).some((l) => l.some(([, c]) => c === k)))
  return (
    <section id="horarios" className="relative scroll-mt-16 overflow-hidden bg-raiz px-4 py-20 text-nevoa sm:px-6 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={patternStyle(box, 0.14)} />
      <div className="relative mx-auto max-w-6xl">
        <Reveal className="mb-10 max-w-2xl">
          <Kicker className="mb-3 text-ambar">Horários</Kicker>
          <h2 className="font-display text-4xl font-extrabold uppercase leading-tight sm:text-5xl">Grade da semana</h2>
          <p className="mt-4 text-base leading-relaxed text-nevoa/75 sm:text-lg">De segunda a sexta, das 06:00 às 19:30. No sábado, Aulão às 09:30.</p>
        </Reveal>

        {/* legenda */}
        <ul className="mb-6 flex flex-wrap gap-2" aria-label="Legenda das modalidades">
          {used.map(([k, m]) => (
            <li key={k} className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold ring-1 ring-white/10">
              <Dot color={m.color} /> {m.label}
            </li>
          ))}
        </ul>

        {/* celular: um dia por vez */}
        <div className="md:hidden">
          <PillToggle
            label="Dia da semana"
            idPrefix="dia"
            controls="grade-dia"
            value={day}
            onChange={setDay}
            options={options}
            className="mb-4 [&_button]:px-1 [&_button]:text-xs"
          />
          <div id="grade-dia" role="tabpanel" aria-labelledby={`dia-${day}`}>
            <DayColumn box={box} day={DAYS.find((d) => d.key === day)} />
          </div>
        </div>

        {/* tela grande: a semana inteira */}
        <div className="hidden gap-3 md:grid md:grid-cols-3 lg:grid-cols-6">
          {DAYS.map((d, i) => (
            <Reveal key={d.key} delay={i * 50}>
              <DayColumn box={box} day={d} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- 4. planos ---------- */
function PlanCard({ fam, row, period, per }) {
  const price = row.prices[period]
  const save = (row.prices.mensal - price) * per.months
  return (
    <div className="group/card flex h-full flex-col rounded-3xl bg-card p-6 ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:ring-ambar">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xl font-extrabold uppercase tracking-wide">{row.label}</span>
        {save > 0 && <span className="rounded-full bg-ambar/20 px-2.5 py-1 text-[11px] font-bold text-highlight">Economize {brl(save)}</span>}
      </div>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="font-display text-5xl font-extrabold tracking-tight">{brl(price).replace(',00', '')}</span>
        <span className="text-sm text-muted">/mês</span>
      </div>
      <p className="mt-1 text-xs text-muted">{per.months > 1 ? `${brl(price * per.months)} no plano ${per.label.toLowerCase()}` : 'Plano mensal'}</p>
      <ul className="mt-5 space-y-2 border-t border-line pt-5 text-sm">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
          {row.freq === 'livre' ? 'Treine quantas vezes quiser na semana' : `${row.freq.replace('x', '')} aulas por semana`}
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
          {fam.desc}
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
          Reserva pelo app ou pelo WhatsApp
        </li>
      </ul>
    </div>
  )
}

function Plans({ box }) {
  const { families, periods, avulsos } = box.catalog
  const [fam, setFam] = useState(families[0].k)
  const [period, setPeriod] = useState('mensal')
  const f = families.find((x) => x.k === fam)
  const per = periods.find((x) => x.k === period)
  const famOptions = [...families.map((x) => ({ key: x.k, label: x.label })), { key: 'AV', label: 'Avulsos' }]

  return (
    <Section id="planos" className="bg-nevoa-deep">
      <SectionTitle kicker="Planos" title="Quanto custa treinar aqui" text="Preço por mês. Nos planos trimestral, semestral e anual o valor mensal cai." />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PillToggle label="Tipo de plano" idPrefix="familia" controls="lista-planos" value={fam} onChange={setFam} options={famOptions} className="w-full max-w-md" />
        {f && (
          <PillToggle
            label="Período"
            idPrefix="periodo"
            controls="lista-planos"
            value={period}
            onChange={setPeriod}
            options={periods.map((p) => ({ key: p.k, label: p.label }))}
            className="w-full max-w-lg [&_button]:px-1"
          />
        )}
      </div>

      <div id="lista-planos" className="mt-8">
        {f ? (
          <>
            <ul className={`grid gap-5 ${f.rows.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:max-w-4xl'}`}>
              {f.rows.map((r, i) => (
                <li key={`${fam}-${period}-${r.freq}`} className="animate-swap" style={{ animationDelay: `${i * 50}ms` }}>
                  <PlanCard fam={f} row={r} period={period} per={per} />
                </li>
              ))}
            </ul>
            {f.addon && (
              <p className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-card px-5 py-4 text-sm ring-1 ring-line lg:max-w-4xl">
                <Dumbbell className="size-4 text-highlight" aria-hidden />
                <span>{f.addon.label}:</span>
                <b>+ {brl(f.addon.price)}/mês</b>
              </p>
            )}
          </>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2 lg:max-w-4xl">
            {avulsos.map((a, i) => (
              <li key={a.label} className="animate-swap" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex h-full flex-col rounded-3xl bg-card p-6 ring-1 ring-line">
                  <span className="font-display text-xl font-extrabold uppercase tracking-wide">{a.label}</span>
                  <span className="mt-1 text-sm text-muted">{a.sub}</span>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="font-display text-5xl font-extrabold tracking-tight">{brl(a.price).replace(',00', '')}</span>
                    <span className="text-sm text-muted">{a.unit}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/* ---------- 5. fechamento ---------- */
function Closing({ box }) {
  const wa = box.page.whatsapp
  return (
    <footer className="bg-raiz px-4 py-16 text-nevoa sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <BoxLogo box={box} kind="texto" className="-ml-3 mb-4 h-24 w-auto object-contain" fallbackClass="mb-4 size-14 text-lg" />
          <p className="font-display text-3xl font-extrabold uppercase sm:text-4xl">Bora treinar?</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-nevoa/70">
            <MapPin className="size-4 text-ambar" aria-hidden /> {box.name} • {box.city}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-nevoa/70">
            <Clock className="size-4 text-ambar" aria-hidden /> Seg a sex 06:00–19:30 • Sáb 09:30
          </p>
        </div>
        {wa ? (
          <CtaLink href={`https://wa.me/${wa}`} external icon={MessageCircle}>Falar com o box</CtaLink>
        ) : (
          <CtaLink to={`/demo?box=${box.slug}`} icon={Smartphone}>Abrir o app do box</CtaLink>
        )}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-nevoa/60">
        <span>Agenda online por DS Agende</span>
        <Link to="/" className="flex items-center gap-1 hover:text-ambar">
          <ArrowLeft className="size-3.5" aria-hidden /> Conhecer o DS Agende
        </Link>
      </div>
    </footer>
  )
}

export default function ClientPage() {
  const { slug } = useParams()
  const box = PRESETS[slug]?.page ? PRESETS[slug] : null

  const theme = useMemo(() => (box ? clientTheme(box.primary, box.secondary) : null), [box])
  const perWeek = useMemo(() => {
    const n = {}
    if (box) Object.values(box.grade).forEach((l) => l.forEach(([, c]) => (n[c] = (n[c] || 0) + 1)))
    return n
  }, [box])

  useEffect(() => {
    if (box) document.title = `${box.name} • Modalidades, horários e planos`
  }, [box])

  // Vindo do card da landing: a rolagem suave do site deixaria a página no meio. Abre sempre no topo.
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [slug])

  if (!box) return <Navigate to="/" replace />

  const total = Object.values(perWeek).reduce((a, b) => a + b, 0)
  const stats = [
    [total, 'aulas por semana'],
    [Object.keys(box.modalities).length, 'modalidades'],
    [Object.values(box.grade).filter((l) => l.length).length, 'dias de treino'],
  ]

  return (
    <div data-club className="landing-root min-h-screen overflow-x-clip bg-nevoa text-raiz" style={theme}>
      <TopBar box={box} />
      <main>
        <Hero box={box} stats={stats} />
        <Modalities box={box} perWeek={perWeek} />
        <Schedule box={box} />
        <Plans box={box} />
      </main>
      <Closing box={box} />
    </div>
  )
}
