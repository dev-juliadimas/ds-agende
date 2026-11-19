/*
 * Peças reutilizáveis da landing: botão-link, ícone em destaque, título e moldura de seção,
 * animação de entrada (Reveal), contador animado e seletor em pílula (PillToggle).
 * Cores e fontes vêm do @theme de ./landing.css (bg-raiz, text-ambar, font-display…).
 *
 * Animações sem biblioteca: um IntersectionObserver liga a classe .is-visible
 * e o CSS de ./landing.css faz a transição. Com "reduzir movimento" ligado, tudo aparece direto.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// true quando o elemento entra na tela (uma vez só)
export function useInView({ threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    if (typeof IntersectionObserver === 'undefined') return setInView(true)
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold, rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [inView, threshold, rootMargin])
  return [ref, inView]
}

// Entrada suave ao rolar. `delay` em ms para escalonar itens de uma lista.
export function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const [ref, inView] = useInView()
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// Número que sobe de 0 até `value` quando `start` vira true
export function useCountUp(value, start, duration = 1300) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!start) return
    if (prefersReducedMotion()) return setN(value)
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration)
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, start, duration])
  return n
}

// Botão-link: "primary" (âmbar), "outline" (contorno marrom) ou "light" (contorno claro, para fundo marrom)
// Use `to` para páginas do próprio site (navega sem recarregar) e `href` para links externos.
export function CtaLink({ to, href, children, variant = 'primary', icon: Icon = ArrowRight, external, className = '' }) {
  const base =
    'group/cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-center text-[15px] font-semibold transition duration-300 active:scale-[.98] sm:whitespace-nowrap'
  const styles = {
    primary:
      'bg-ambar text-ink shadow-[0_10px_24px_-12px_rgba(191,144,85,.9)] hover:-translate-y-0.5 hover:bg-ambar-hover hover:shadow-[0_14px_30px_-12px_rgba(191,144,85,1)]',
    outline: 'border border-raiz/25 text-raiz hover:border-raiz hover:bg-raiz/5',
    light: 'border border-nevoa/30 text-nevoa hover:border-nevoa hover:bg-nevoa/10',
  }[variant]
  const content = (
    <>
      <span>{children}</span>
      {Icon && <Icon className="size-4 shrink-0 transition duration-300 group-hover/cta:translate-x-1" aria-hidden />}
    </>
  )
  if (to) return <Link to={to} className={`${base} ${styles} ${className}`}>{content}</Link>
  return (
    <a
      href={href}
      className={`${base} ${styles} ${className}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {content}
    </a>
  )
}

// Ícone em destaque: âmbar (#BF9055) sobre um quadro marrom, para manter o contraste.
// Dentro de um card com a classe `group/card`, o ícone gira e cresce de leve no hover.
export function FeatureIcon({ icon: Icon, tone = 'solid', size = 'md' }) {
  const bg = tone === 'onDark' ? 'bg-nevoa/10' : 'bg-raiz'
  const box = size === 'sm' ? 'size-10 rounded-lg' : 'size-12 rounded-xl'
  return (
    <span
      className={`grid shrink-0 place-items-center text-ambar transition duration-500 ease-out group-hover/card:-rotate-6 group-hover/card:scale-110 ${box} ${bg}`}
    >
      <Icon className={size === 'sm' ? 'size-5' : 'size-6'} strokeWidth={1.75} aria-hidden />
    </span>
  )
}

// Rótulo pequeno em caixa alta usado acima dos títulos
export const Kicker = ({ children, className = 'mb-3 text-highlight' }) => (
  <p className={`text-xs font-bold uppercase tracking-[0.22em] ${className}`}>{children}</p>
)

// Título padrão das seções (rótulo + título + texto opcional), com entrada suave
export function SectionTitle({ kicker, title, text, center = false }) {
  return (
    <Reveal className={`mb-12 max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      <Kicker>{kicker}</Kicker>
      <h2 className="font-display text-3xl leading-tight sm:text-[2.6rem]">{title}</h2>
      {text && <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{text}</p>}
    </Reveal>
  )
}

// Moldura de seção com respiro e largura máxima
export const Section = ({ id, className = '', children }) => (
  <section id={id} className={`scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28 ${className}`}>
    <div className="mx-auto max-w-6xl">{children}</div>
  </section>
)

/*
 * Seletor em pílula com indicador que desliza (padrão ARIA de abas: setas trocam a opção).
 * options: [{ key, label, hint?, icon? }]
 * controls: id do painel que o seletor controla.
 */
export function PillToggle({ options, value, onChange, label, idPrefix, controls, className = '' }) {
  const refs = useRef([])
  const index = Math.max(0, options.findIndex((o) => o.key === value))

  const onKeyDown = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
    onChange(options[next].key)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`relative grid rounded-full bg-card p-1 ring-1 ring-line shadow-[0_8px_24px_-16px_rgba(71,36,21,.4)] ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* indicador que desliza até a opção ativa */}
      <span
        aria-hidden
        className="pill-indicator absolute inset-y-1 left-1 rounded-full bg-raiz shadow-[0_6px_16px_-8px_rgba(71,36,21,.8)]"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o, i) => {
        const on = o.key === value
        const Icon = o.icon
        return (
          <button
            key={o.key}
            ref={(el) => (refs.current[i] = el)}
            id={`${idPrefix}-${o.key}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={controls}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold leading-tight transition-colors duration-300 sm:px-5 sm:text-sm ${
              on ? 'text-nevoa' : 'text-muted hover:text-raiz'
            }`}
          >
            {Icon && <Icon className={`size-4 shrink-0 ${on ? 'text-ambar' : ''}`} strokeWidth={1.9} aria-hidden />}
            <span className="flex flex-col items-start sm:flex-row sm:items-baseline sm:gap-1.5">
              <span>{o.label}</span>
              {o.hint && <span className={`text-[11px] font-normal ${on ? 'text-nevoa/75' : 'text-muted'}`}>{o.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
