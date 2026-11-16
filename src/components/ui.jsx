import { Moon, Sun, X } from 'lucide-react'
import { LEVELS } from '../lib/constants'

// Logo da marca: a versão escura (traços creme) aparece só no Modo Noturno — ver .logo-light/.logo-dark no CSS
export function Logo({ className = 'h-8 w-auto', alt = 'DS Agende' }) {
  return (
    <>
      <img src={`${import.meta.env.BASE_URL}logo-ds-agende.png`} alt={alt} className={`logo-light ${className}`} />
      <img src={`${import.meta.env.BASE_URL}logo-ds-agende-dark.png`} alt={alt} className={`logo-dark ${className}`} />
    </>
  )
}

export function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={dark}
      aria-label={dark ? 'Mudar para o Modo Claro' : 'Mudar para o Modo Noturno'}
      title={dark ? 'Modo Claro' : 'Modo Noturno'}
      className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-semibold text-fg-soft ring-1 ring-line transition hover:text-fg hover:ring-copper"
    >
      {dark ? <Sun size={15} className="text-highlight" /> : <Moon size={15} className="text-highlight" />}
      <span className="hidden sm:inline">{dark ? 'Modo Claro' : 'Modo Noturno'}</span>
    </button>
  )
}

export function LevelTag({ level, size = 'sm' }) {
  const l = LEVELS[level]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ring-1 ${l.cls} ${size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} font-semibold uppercase tracking-wide`}>
      <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
      {size === 'xs' ? l.short : l.label}
    </span>
  )
}

export function CapacityBar({ taken, cap, trials, quota }) {
  const pct = Math.min(100, (taken / cap) * 100)
  const color = pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-accent'
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-fg-muted">
        <span>
          <b className="font-display text-base text-fg">{taken}</b>/{cap} vagas
        </span>
        {quota != null && (
          <span>
            exp. {trials}/{quota}
          </span>
        )}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Sheet({ open, onClose, title, children, tall }) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/70 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className={`animate-slideup w-full overflow-y-auto rounded-t-3xl border-t border-line bg-surface scroll-thin ${tall ? 'max-h-[92%]' : 'max-h-[85%]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <h3 className="font-display text-xl font-bold uppercase tracking-wide">{title}</h3>
          <button onClick={onClose} className="rounded-full bg-card p-1.5 text-fg-muted hover:text-fg" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Btn({ children, variant = 'primary', className = '', ...p }) {
  const v = {
    primary: 'bg-accent text-ink hover:bg-accent-strong',
    dark: 'bg-card text-fg ring-1 ring-line hover:bg-elevated',
    ghost: 'text-fg-soft hover:bg-card',
    danger: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/25',
    wa: 'bg-wa-light text-white hover:brightness-95',
  }[variant]
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

export function Chip({ active, children, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-accent text-ink' : 'bg-card text-fg-soft ring-1 ring-line hover:bg-elevated'} ${className}`}
    >
      {children}
    </button>
  )
}

export function Alert({ kind = 'warn', children }) {
  const c = {
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    err: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  }[kind]
  return <div className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${c}`}>{children}</div>
}

export function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-14 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`animate-slideup rounded-xl px-3 py-2.5 text-xs font-semibold shadow-xl ${t.kind === 'err' ? 'bg-rose-600 text-white' : 'bg-inverse text-on-inverse'}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub, accent }) {
  return (
    <div className="rounded-2xl bg-card/80 p-3 ring-1 ring-line">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`font-display text-2xl font-bold ${accent || 'text-fg'}`}>{value}</div>
      {sub && <div className="text-[11px] text-fg-subtle">{sub}</div>}
    </div>
  )
}
