/*
 * Super Admin do DS Agende — /super-admin
 *
 * Só para usuários com profiles.is_super_admin = true (checado no banco em todas as RPCs;
 * a tela só esconde o conteúdo de quem não é). Gerencia os clientes (tabela boxes):
 *   • lista com status, slug (/clientes/:slug) e quantidade de alunos
 *   • cadastrar / editar: nome, slug, categoria, cores, logos e link da Comunidade
 *   • toggle para suspender / liberar o acesso (ex.: inadimplência do SaaS)
 * Dados: supabase/migrations/20261130_super_admin.sql.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Loader2, Lock, LogOut, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { ThemeToggle } from '../components/ui'
import * as agendaApi from '../lib/api/agenda'
import * as api from '../lib/api/superAdmin'
import { Field, PasswordInput, input } from '../agenda/AuthScreen'
import { ToastStack, useToasts } from '../agenda/toasts'

const CATEGORIES = ['CrossFit', 'Pilates', 'Funcional', 'Academia', 'Yoga', 'Dança', 'Luta', 'Estética', 'Fisioterapia', 'Nutrição']
const EMPTY = { id: null, name: '', slug: '', category: 'CrossFit', brand_primary: '#243464', brand_secondary: '#fcbc18', logo_light_url: '', logo_dark_url: '', whatsapp_community_url: '' }
const HEX = /^#[0-9a-fA-F]{6}$/

const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/* ---------- moldura ---------- */

function Shell({ theme, toggle, onLogout, children }) {
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-inverse text-on-inverse">
              <ShieldCheck size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-highlight">Super Admin</div>
              <div className="truncate font-display text-lg font-bold uppercase leading-tight">Clientes DS Agende</div>
            </div>
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

/* ---------- login ---------- */

function Login({ onDone, notify }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const r = await agendaApi.signIn(email, password)
    setBusy(false)
    if (!r.ok) return notify(r.message, 'err')
    onDone()
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-2xl bg-card p-5 ring-1 ring-line">
      <p className="text-sm text-fg-muted">Entre com a conta de administrador da plataforma.</p>
      <Field label="E-mail">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className={input} />
      </Field>
      <Field label="Senha">
        <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="Sua senha" />
      </Field>
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-bold text-on-accent disabled:opacity-60">
        {busy && <Loader2 size={16} className="animate-spin" />} Entrar
      </button>
    </form>
  )
}

/* ---------- toggle ativo/inativo ---------- */

function ActiveSwitch({ box, onChange }) {
  const [busy, setBusy] = useState(false)
  const flip = async () => {
    const next = !box.is_active
    if (!next && !window.confirm(`Suspender o acesso de "${box.name}"?\n\nAlunos e equipe deixam de entrar na agenda e no painel até você liberar de novo. Nenhum dado é apagado.`)) return
    setBusy(true)
    await onChange(box, next)
    setBusy(false)
  }
  return (
    <button
      role="switch"
      aria-checked={box.is_active}
      aria-label={box.is_active ? `Suspender ${box.name}` : `Liberar ${box.name}`}
      onClick={flip}
      disabled={busy}
      className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase disabled:opacity-60"
    >
      <span className={box.is_active ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>{box.is_active ? 'Ativo' : 'Inativo'}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${box.is_active ? 'bg-emerald-500' : 'bg-line-strong'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${box.is_active ? 'left-[22px]' : 'left-0.5'}`} />
        {busy && <Loader2 size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-fg" />}
      </span>
    </button>
  )
}

/* ---------- linha da lista ---------- */

function Logo({ box }) {
  const [broken, setBroken] = useState(false)
  const url = box.logo_light_url || box.logo_dark_url
  const initials = box.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  if (url && !broken) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-elevated">
        <img src={box.logo_light_url || url} alt="" onError={() => setBroken(true)} className="logo-light h-full w-full object-contain" />
        <img src={box.logo_dark_url || url} alt="" onError={() => setBroken(true)} className="logo-dark h-full w-full object-contain" />
      </span>
    )
  }
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold"
      style={{ background: box.brand_primary || '#555', color: box.brand_secondary || '#fff' }}
    >
      {initials}
    </span>
  )
}

function BoxRow({ box, onEdit, onToggle }) {
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-line ${box.is_active ? '' : 'opacity-70'}`}>
      <Logo box={box} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="truncate">{box.name}</b>
          {box.category && <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold uppercase text-fg-muted">{box.category}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          {box.slug ? (
            <Link to={`/clientes/${box.slug}`} target="_blank" className="inline-flex items-center gap-1 font-mono hover:text-fg hover:underline">
              /clientes/{box.slug} <ExternalLink size={11} />
            </Link>
          ) : (
            <span className="text-rose-600 dark:text-rose-300">sem slug</span>
          )}
          <span>
            <b className="text-fg">{box.alunos}</b> aluno{box.alunos === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1" title="Cores">
            <span className="h-3 w-3 rounded-full ring-1 ring-line" style={{ background: box.brand_primary || 'transparent' }} />
            <span className="h-3 w-3 rounded-full ring-1 ring-line" style={{ background: box.brand_secondary || 'transparent' }} />
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ActiveSwitch box={box} onChange={onToggle} />
        <button onClick={() => onEdit(box)} aria-label={`Editar ${box.name}`} title="Editar" className="rounded-lg p-2 text-fg-muted ring-1 ring-line hover:bg-elevated hover:text-fg">
          <Pencil size={15} />
        </button>
      </div>
    </li>
  )
}

/* ---------- formulário ---------- */

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={`${label} (seletor)`} className="h-12 w-12 shrink-0 cursor-pointer rounded-xl border border-line bg-card p-1" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#RRGGBB" maxLength={7} className={`${input} font-mono`} />
      </div>
    </Field>
  )
}

function BoxForm({ initial, onClose, onSaved, notify }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? ''])) }))
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.id))
  const [busy, setBusy] = useState(false)
  const isNew = !f.id
  const customCategory = f.category && !CATEGORIES.includes(f.category)
  const [otherCat, setOtherCat] = useState(customCategory)

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const onName = (v) => setF((x) => ({ ...x, name: v, slug: slugTouched ? x.slug : slugify(v) }))

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    for (const k of ['brand_primary', 'brand_secondary']) {
      if (f[k] && !HEX.test(f[k])) return notify('Cor inválida. Use o formato #RRGGBB.', 'err')
    }
    setBusy(true)
    const r = await api.saveBox(f)
    setBusy(false)
    notify(r.message, r.ok ? 'ok' : 'err')
    if (r.ok) onSaved()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sa-form-title"
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-canvas p-5 ring-1 ring-line sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="sa-form-title" className="font-display text-xl font-bold uppercase">
            {isNew ? 'Novo cliente' : 'Editar cliente'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-fg-muted hover:bg-card hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Nome">
            <input value={f.name} onChange={(e) => onName(e.target.value)} required minLength={2} maxLength={80} placeholder="Ex.: Içara Training Club" className={input} autoFocus />
          </Field>

          <Field label="Slug" hint={`Endereço da página: /clientes/${f.slug || '…'}`}>
            <input
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true)
                set('slug')(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }}
              required
              maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Letras minúsculas, números e hífen"
              className={`${input} font-mono`}
            />
          </Field>

          <Field label="Categoria">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setOtherCat(false)
                    set('category')(c)
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${!otherCat && f.category === c ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line'}`}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOtherCat(true)
                  if (CATEGORIES.includes(f.category)) set('category')('')
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${otherCat ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line'}`}
              >
                Outra
              </button>
            </div>
            {otherCat && <input value={f.category} onChange={(e) => set('category')(e.target.value)} maxLength={30} placeholder="Qual categoria?" className={`${input} mt-2`} />}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Cor primária" value={f.brand_primary} onChange={set('brand_primary')} />
            <ColorField label="Cor secundária" value={f.brand_secondary} onChange={set('brand_secondary')} />
          </div>
          {HEX.test(f.brand_primary) && HEX.test(f.brand_secondary) && (
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: f.brand_primary }}>
              <span className="font-display text-sm font-bold uppercase text-white">{f.name || 'Prévia'}</span>
              <span className="ml-auto rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: f.brand_secondary, color: f.brand_primary }}>
                Reservar
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Logo (fundo claro)" hint="URL https:// (versão escura da logo)">
              <input type="url" value={f.logo_light_url} onChange={(e) => set('logo_light_url')(e.target.value)} pattern="https://.*" placeholder="https://…" className={input} />
            </Field>
            <Field label="Logo (fundo escuro)" hint="URL https:// (versão clara da logo)">
              <input type="url" value={f.logo_dark_url} onChange={(e) => set('logo_dark_url')(e.target.value)} pattern="https://.*" placeholder="https://…" className={input} />
            </Field>
          </div>
          {(f.logo_light_url || f.logo_dark_url) && (
            <div className="grid grid-cols-2 gap-2">
              {[
                [f.logo_light_url, '#ffffff'],
                [f.logo_dark_url, '#111111'],
              ].map(([u, bg], i) => (
                <div key={i} className="flex h-20 items-center justify-center rounded-xl ring-1 ring-line" style={{ background: bg }}>
                  {u ? <img src={u} alt="" className="max-h-16 max-w-[80%] object-contain" /> : <span className="text-[11px] text-neutral-400">sem logo</span>}
                </div>
              ))}
            </div>
          )}

          <Field label="Comunidade do WhatsApp" hint="Convite no formato https://chat.whatsapp.com/…">
            <input type="url" value={f.whatsapp_community_url} onChange={(e) => set('whatsapp_community_url')(e.target.value)} placeholder="https://chat.whatsapp.com/…" className={input} />
          </Field>
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl py-3 font-bold text-fg-soft ring-1 ring-line hover:bg-card">
            Cancelar
          </button>
          <button disabled={busy} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-accent py-3 font-bold text-on-accent disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {isNew ? 'Cadastrar cliente' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ---------- painel ---------- */

const FILTERS = [
  ['todos', 'Todos'],
  ['ativos', 'Ativos'],
  ['inativos', 'Inativos'],
]

function Clients({ notify }) {
  const [data, setData] = useState({ status: 'loading', rows: [] })
  const [editing, setEditing] = useState(null) // null | {} (novo) | box
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('todos')

  const load = useCallback(async () => {
    try {
      setData({ status: 'ok', rows: await api.listBoxes() })
    } catch (e) {
      setData((d) => (d.status === 'ok' ? d : { status: 'error', message: e.message, rows: [] }))
      notify(e.message, 'err')
    }
  }, [notify])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (box, active) => {
    const r = await api.setBoxActive(box.id, active)
    notify(r.ok ? `${box.name}: ${r.message.toLowerCase()}` : r.message, r.ok ? 'ok' : 'err')
    if (r.ok) setData((d) => ({ ...d, rows: d.rows.map((b) => (b.id === box.id ? { ...b, is_active: r.data } : b)) }))
  }

  const rows = useMemo(() => {
    const t = norm(q).trim()
    return data.rows.filter(
      (b) =>
        (filter === 'todos' || (filter === 'ativos' ? b.is_active : !b.is_active)) &&
        (!t || norm(b.name).includes(t) || norm(b.slug).includes(t) || norm(b.category).includes(t)),
    )
  }, [data.rows, q, filter])

  if (data.status === 'loading') return <Center />
  if (data.status === 'error') {
    return (
      <Empty icon={RefreshCw}>
        Não foi possível carregar os clientes.
        <button onClick={load} className="mt-2 font-semibold text-fg underline underline-offset-4">
          Tentar de novo
        </button>
      </Empty>
    )
  }

  const ativos = data.rows.filter((b) => b.is_active).length
  const alunos = data.rows.filter((b) => b.is_active).reduce((s, b) => s + (b.alunos || 0), 0)

  return (
    <section>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Clientes', data.rows.length],
          ['Ativos', ativos],
          ['Alunos (ativos)', alunos],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-card px-3 py-3 ring-1 ring-line">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{l}</div>
            <div className="font-display text-2xl font-bold leading-tight">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, slug ou categoria" aria-label="Buscar" className="w-full rounded-xl border border-line bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-accent/60" />
        </label>
        <div className="flex gap-1">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === k ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={load} aria-label="Atualizar" title="Atualizar" className="rounded-xl p-2.5 text-fg-muted ring-1 ring-line hover:bg-card hover:text-fg">
          <RefreshCw size={15} />
        </button>
        <button onClick={() => setEditing({})} className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent">
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      <div className="mt-3">
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((b) => (
              <BoxRow key={b.id} box={b} onEdit={setEditing} onToggle={toggle} />
            ))}
          </ul>
        ) : (
          <Empty>{data.rows.length ? 'Nenhum cliente com esse filtro.' : 'Nenhum cliente cadastrado ainda.'}</Empty>
        )}
      </div>

      {editing && (
        <BoxForm
          initial={editing}
          notify={notify}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </section>
  )
}

export default function SuperAdmin() {
  const { theme, toggle } = useTheme()
  const { toasts, push } = useToasts()
  const [view, setView] = useState('loading') // loading | auth | denied | ready | offline

  useEffect(() => {
    document.title = 'DS Agende • Super Admin'
  }, [])

  const check = useCallback(async () => {
    if (!isSupabaseConfigured) return setView('offline')
    setView('loading')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session || data.session.user.is_anonymous) return setView('auth')
      setView((await api.amISuperAdmin()) ? 'ready' : 'denied')
    } catch {
      setView('auth')
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const logout = async () => {
    await agendaApi.signOut()
    setView('auth')
  }

  return (
    <Shell theme={theme} toggle={toggle} onLogout={view === 'ready' || view === 'denied' ? logout : null}>
      <ToastStack toasts={toasts} />
      {view === 'loading' && <Center />}
      {view === 'offline' && <Empty icon={Lock}>Servidor não configurado. Verifique o arquivo .env.</Empty>}
      {view === 'auth' && <Login onDone={check} notify={push} />}
      {view === 'denied' && (
        <div className="mx-auto max-w-md">
          <Empty icon={Lock}>
            <b className="text-fg">Esta conta não tem acesso ao Super Admin.</b>
            Entre com a conta de administrador da plataforma.
          </Empty>
        </div>
      )}
      {view === 'ready' && <Clients notify={push} />}
    </Shell>
  )
}
