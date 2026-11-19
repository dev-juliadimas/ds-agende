// 5. Eles já usam — clientes vindos do Supabase (featured_clients), filtro por formato
// e cards clicáveis (selo de categoria e seta que desliza no hover)
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { presetByName } from '../../lib/boxPresets'
import { supabase } from '../../lib/supabase'
import { CLIENT_FILTERS } from '../data'
import { PillToggle, Reveal, Section, SectionTitle } from '../ui'

const SKELETON_COUNT = 4

// Iniciais para o monograma quando o cliente ainda não tem logo
const initials = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('')

// Só links http(s) viram href (o banco também barra, isto é a segunda trava)
const safeUrl = (url) => (/^https?:\/\//i.test(url ?? '') ? url : undefined)

/**
 * Busca os clientes ativos. status: 'loading' | 'ready' | 'empty' | 'error'.
 * Sem .env (build da demo) a seção simplesmente não aparece.
 */
function useFeaturedClients() {
  const [state, setState] = useState({ status: supabase ? 'loading' : 'empty', clients: [] })

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    supabase
      .from('featured_clients')
      .select('id, name, category, logo_url, site_url, format, subtitle, city')
      .eq('active', true)
      .order('display_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          if (import.meta.env.DEV) console.warn('[landing] featured_clients:', error.message)
          setState({ status: 'error', clients: [] })
          return
        }
        const clients = (data ?? []).filter((c) => c.name && safeUrl(c.site_url))
        setState({ status: clients.length ? 'ready' : 'empty', clients })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

function ClientLogo({ name, logoUrl }) {
  const [broken, setBroken] = useState(false)

  if (logoUrl && !broken) {
    // Placa creme: use no Storage a versão da logo feita para fundo claro (escura).
    return (
      <span className="relative mt-6 block h-28 overflow-hidden rounded-2xl bg-nevoa-deep ring-1 ring-line transition duration-500 group-hover/card:scale-[1.02]">
        <img
          src={logoUrl}
          alt={`Logo ${name}`}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-contain p-1"
        />
      </span>
    )
  }
  return (
    <span
      className="mt-6 grid size-14 place-items-center rounded-2xl bg-raiz font-display text-lg text-ambar transition duration-500 group-hover/card:-rotate-6 group-hover/card:scale-105"
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

function ClientCard({ name, category, logo_url, site_url, subtitle, city }) {
  // Cliente com página própria no site (src/lib/boxPresets.js) abre ela; os outros, o site externo
  const page = presetByName(name)
  const Tag = page ? Link : 'a'
  const linkProps = page ? { to: `/clientes/${page.slug}` } : { href: safeUrl(site_url), target: '_blank', rel: 'noopener noreferrer' }
  return (
    <Tag
      {...linkProps}
      className="group/card relative flex h-full flex-col overflow-hidden rounded-3xl bg-card p-6 ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:ring-ambar hover:shadow-[0_24px_44px_-26px_rgba(71,36,21,.6)]"
    >
      {/* faixa âmbar que cresce no hover */}
      <span
        className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-ambar transition-transform duration-500 group-hover/card:scale-x-100"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-nevoa-deep px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-highlight ring-1 ring-line transition duration-300 group-hover/card:bg-raiz group-hover/card:text-ambar group-hover/card:ring-raiz">
          {category}
        </span>
        <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-nevoa-deep text-muted transition duration-300 group-hover/card:bg-ambar group-hover/card:text-ink">
          {/* a seta sai pela diagonal e outra entra no lugar */}
          <span className="relative block size-4">
            <ArrowUpRight className="absolute inset-0 size-4 transition duration-300 group-hover/card:-translate-y-5 group-hover/card:translate-x-5" aria-hidden />
            <ArrowUpRight className="absolute inset-0 size-4 -translate-x-5 translate-y-5 transition duration-300 group-hover/card:translate-x-0 group-hover/card:translate-y-0" aria-hidden />
          </span>
        </span>
      </div>

      <ClientLogo name={name} logoUrl={logo_url} />
      <span className="mt-5 font-display text-lg leading-snug">{name}</span>
      {subtitle && <span className="mt-1 text-sm text-muted">{subtitle}</span>}
      {city && (
        <span className="mt-auto flex items-center gap-1 pt-4 text-xs text-muted">
          <MapPin className="size-3.5 text-highlight" aria-hidden /> {city}
        </span>
      )}
      {!page && <span className="sr-only">(abre em nova aba)</span>}
    </Tag>
  )
}

// Mesmo formato do card, em blocos creme/âmbar pulsando
function ClientCardSkeleton() {
  const block = 'bg-line/70 animate-pulse motion-reduce:animate-none'
  return (
    <div className="flex h-full flex-col rounded-3xl bg-card p-6 ring-1 ring-line" aria-hidden>
      <div className="flex items-start justify-between gap-3">
        <span className={`h-6 w-20 rounded-full ${block}`} />
        <span className={`size-9 rounded-full ${block}`} />
      </div>
      <span className="mt-6 size-14 rounded-2xl bg-raiz/15 animate-pulse motion-reduce:animate-none" />
      <span className={`mt-5 h-5 w-3/4 rounded-md ${block}`} />
      <span className={`mt-2 h-4 w-1/2 rounded-md ${block}`} />
      <span className="mt-auto flex items-center gap-1.5 pt-5">
        <span className="size-3.5 rounded-full bg-ambar/30 animate-pulse motion-reduce:animate-none" />
        <span className={`h-3 w-24 rounded ${block}`} />
      </span>
    </div>
  )
}

export default function Clients() {
  const { status, clients } = useFeaturedClients()
  const [filter, setFilter] = useState('todos')

  // Erro ou lista vazia: a seção some sem deixar buraco na página
  if (status === 'empty' || status === 'error') return null

  const loading = status === 'loading'
  // O filtro só faz sentido quando existem os dois formatos cadastrados
  const formats = new Set(clients.map((c) => c.format).filter(Boolean))
  const showFilter = !loading && formats.size > 1
  const active = showFilter ? filter : 'todos'
  const list = clients.filter((c) => active === 'todos' || c.format === active)

  return (
    <Section id="clientes">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionTitle
          kicker="Eles já usam"
          title="Do esmalte ao kettlebell"
          text="Profissionais e espaços de formatos diferentes, a mesma agenda sem furos."
        />
        {showFilter && (
          <Reveal className="mb-12 w-full max-w-sm md:w-auto">
            <PillToggle
              label="Filtrar clientes"
              idPrefix="filtro-clientes"
              controls="lista-clientes"
              value={active}
              onChange={setFilter}
              options={CLIENT_FILTERS}
            />
          </Reveal>
        )}
      </div>

      {loading ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Carregando clientes">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <li key={i}>
              <ClientCardSkeleton />
            </li>
          ))}
        </ul>
      ) : (
        <ul
          id="lista-clientes"
          {...(showFilter ? { role: 'tabpanel', 'aria-labelledby': `filtro-clientes-${active}` } : {})}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {list.map((c, i) => (
            // key com o filtro: os cards entram de novo, escalonados, a cada troca
            <li key={`${active}-${c.id}`} className="animate-swap" style={{ animationDelay: `${i * 50}ms` }}>
              <ClientCard {...c} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
