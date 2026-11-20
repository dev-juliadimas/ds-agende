/*
 * Painel do administrador → Alunos → Equipe.
 * Edita dados, papel e permissão de avisos de coaches e administradores, e desativa / reativa
 * coach. Desativar com aulas exige escolher quem assume (RPC deactivate_coach, atômica).
 * Regras no banco: migrations/20261208_gestao_equipe.sql.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, ChevronDown, Loader2, Megaphone, Save, ShieldAlert, UserCheck, UserMinus } from 'lucide-react'
import * as api from '../lib/api/painel'
import { Modal, Switch } from '../avisos/shared'
import { Chip, WaButton, fmtDate } from './parts'

const ROLES = [
  ['owner', 'Administrador'],
  ['coach', 'Coach'],
  ['aluno', 'Aluno'],
]
const ROLE_LABEL = Object.fromEntries(ROLES)

const inputCls =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 disabled:opacity-60'
const btn = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold ring-1 ring-line hover:bg-elevated disabled:opacity-60'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const loadOf = (m) => (m.fixed_slots || 0) + (m.future_sessions || 0)
const loadText = (m) => {
  const parts = []
  if (m.fixed_slots) parts.push(plural(m.fixed_slots, 'turma fixa', 'turmas fixas'))
  if (m.future_sessions) parts.push(plural(m.future_sessions, 'aula a partir de hoje', 'aulas a partir de hoje'))
  return parts.join(' · ')
}

/** Telefone salvo (55 + DDD + número) → só DDD + número, para editar. */
const phoneForInput = (p) => {
  const d = String(p || '').replace(/\D/g, '')
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}
const fmtPhone = (p) => {
  const d = phoneForInput(p)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return p || '—'
}

const formOf = (m) => ({
  name: m.name || '',
  phone: phoneForInput(m.phone),
  email: m.email || '',
  birthDate: m.birth_date ? String(m.birth_date).slice(0, 10) : '',
  role: m.role,
  canPublish: !!m.can_publish_notices_directly,
})

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  )
}

/* ---------- card do membro ---------- */

function TeamRow({ m, boxId, me, activeOwners, onDeactivate, notify, onChanged }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => formOf(m))
  const [busy, setBusy] = useState(null) // 'save' | 'reactivate'
  // a lista recarregou (salvou / desativou): o formulário volta para os dados do banco
  useEffect(() => setForm(formOf(m)), [m])

  const inactive = m.active === false
  const isMe = m.person_id === me?.id
  const onlyOwner = m.role === 'owner' && activeOwners <= 1
  const hasClasses = loadOf(m) > 0
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(m))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const roleDisabled = (r) => {
    if (r === m.role) return false
    if (onlyOwner) return true // o box não pode ficar sem administrador ativo
    if (r === 'owner' && inactive) return true
    if (r === 'aluno' && hasClasses) return true
    return false
  }
  const roleHint = onlyOwner
    ? 'Único administrador ativo do box: promova outra pessoa antes de mudar este papel.'
    : inactive
      ? 'Coach inativo: reative para promover a administrador.'
      : hasClasses && m.role !== 'aluno'
        ? 'Para virar aluno, passe as aulas antes em “Desativar coach”.'
        : form.role === 'aluno'
          ? 'Sai da equipe: perde o acesso ao painel e vai para a lista de alunos.'
          : null

  const save = async () => {
    if (form.role !== m.role && isMe && !window.confirm(`Mudar o seu próprio papel para ${ROLE_LABEL[form.role]}? Você perde o acesso de administrador.`)) return
    setBusy('save')
    const res = await api.updateTeamMember({ boxId, personId: m.person_id, ...form })
    setBusy(null)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) onChanged()
  }

  const reactivate = async () => {
    setBusy('reactivate')
    const res = await api.reactivateCoach({ boxId, coachId: m.person_id })
    setBusy(null)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) onChanged()
  }

  return (
    <li className={`rounded-2xl bg-card ring-1 ring-line ${inactive ? 'opacity-70' : ''}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated font-display text-sm font-bold">{m.name?.[0]}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{m.name}</span>
            {isMe && <span className="shrink-0 text-[11px] text-fg-subtle">(você)</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            <Chip tone={inactive ? 'muted' : 'info'}>{ROLE_LABEL[m.role] || m.role}</Chip>
            {inactive && <Chip tone="muted">Inativo</Chip>}
            {!inactive && m.role === 'coach' && m.can_publish_notices_directly && (
              <span className="inline-flex items-center gap-1" title="Publica avisos sem aprovação">
                <Megaphone size={12} /> publica direto
              </span>
            )}
            <span className="truncate">{inactive ? `desde ${fmtDate(m.deactivated_at)}` : loadText(m) || 'sem aulas'}</span>
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-fg-subtle transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nome completo">
                <input className={inputCls} value={form.name} onChange={set('name')} maxLength={80} autoComplete="off" />
              </Field>
            </div>
            <Field label="WhatsApp" hint={fmtPhone(m.phone)}>
              <input className={inputCls} value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="(48) 99999-0000" maxLength={20} />
            </Field>
            <Field label="Nascimento">
              <input type="date" className={inputCls} value={form.birthDate} onChange={set('birthDate')} max={new Date().toISOString().slice(0, 10)} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="E-mail de login"
                hint={m.has_account ? 'Muda o e-mail que a pessoa usa para entrar no app.' : 'Ainda não criou conta no app: o e-mail é definido no cadastro dela.'}
              >
                <input
                  type="email"
                  className={inputCls}
                  value={form.email}
                  onChange={set('email')}
                  disabled={!m.has_account}
                  placeholder={m.has_account ? 'nome@email.com' : 'Sem conta no app'}
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Nível de permissão</span>
            <div role="radiogroup" aria-label="Nível de permissão" className="grid grid-cols-3 gap-1 rounded-xl bg-elevated p-1 ring-1 ring-line">
              {ROLES.map(([k, l]) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={form.role === k}
                  disabled={roleDisabled(k)}
                  onClick={() => setForm((f) => ({ ...f, role: k }))}
                  className={`rounded-lg py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    form.role === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {roleHint && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-fg-muted">
                <ShieldAlert size={13} className="mt-px shrink-0 text-amber-600 dark:text-amber-300" /> {roleHint}
              </p>
            )}
          </div>

          {form.role === 'coach' && (
            <div className="rounded-xl bg-elevated px-3 py-3 ring-1 ring-line">
              <Switch
                checked={form.canPublish}
                onChange={(on) => setForm((f) => ({ ...f, canPublish: on }))}
                icon={Megaphone}
                label="Publicar avisos sem aprovação"
                description={form.canPublish ? 'Os avisos deste coach vão direto para o mural.' : 'Os avisos deste coach esperam a sua aprovação.'}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={!dirty || !!busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent-strong disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
            {dirty && (
              <button onClick={() => setForm(formOf(m))} disabled={!!busy} className={`${btn} text-fg-muted`}>
                Descartar
              </button>
            )}
            <WaButton phone={m.phone} text={`Olá, ${String(m.name).split(' ')[0]}!`} />
          </div>

          {m.role === 'coach' && !isMe && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p className="text-xs text-fg-muted">
                {inactive
                  ? 'Inativo: sem acesso ao painel e fora das aulas e trocas. As aulas passadas continuam no nome dele.'
                  : hasClasses
                    ? `Tem ${loadText(m)}. Ao desativar, você escolhe quem assume.`
                    : 'Sem aulas na grade nem marcadas.'}
              </p>
              {inactive ? (
                <button onClick={reactivate} disabled={!!busy} className={btn}>
                  {busy === 'reactivate' ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} Reativar
                </button>
              ) : (
                <button onClick={() => onDeactivate(m)} disabled={!!busy} className={`${btn} text-rose-700 dark:text-rose-300`}>
                  <UserMinus size={14} /> Desativar coach
                </button>
              )}
            </div>
          )}
          {m.role === 'owner' && !isMe && (
            <p className="border-t border-line pt-3 text-xs text-fg-subtle">Para desativar um administrador, mude o papel dele para Coach antes.</p>
          )}
        </div>
      )}
    </li>
  )
}

/* ---------- desativar com transferência ---------- */

function DeactivateModal({ m, boxId, candidates, notify, onDone, onClose }) {
  const needsReplacement = loadOf(m) > 0
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => !busy && onClose()

  const confirm = async () => {
    setBusy(true)
    const res = await api.deactivateCoach({ boxId, coachId: m.person_id, replacementId: to || null })
    setBusy(false)
    notify(res.message, res.ok ? 'ok' : 'err')
    // ok: fecha e recarrega. Aulas novas desde que a lista carregou: recarrega e pede o substituto.
    if (res.ok || res.code === 'SUBSTITUTO_OBRIGATORIO' || res.code === 'SUBSTITUTO_INVALIDO') onDone(res.ok)
  }

  return (
    <Modal
      open
      onClose={close}
      title="Desativar coach"
      footer={
        <div className="flex gap-2">
          <button onClick={close} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-fg-soft ring-1 ring-line hover:bg-card">
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={busy || (needsReplacement && !to)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />} Desativar
          </button>
        </div>
      }
    >
      <p className="text-sm text-fg-muted">
        <b className="text-fg">{m.name}</b> perde o acesso ao painel e deixa de aparecer como opção para aulas e trocas. Os pedidos de troca pendentes dele são encerrados. Dá para
        reativar depois.
      </p>

      {needsReplacement ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm ring-1 ring-amber-500/30">
            <ArrowRightLeft size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
            <span>
              Tem <b>{loadText(m)}</b>. Escolha quem assume: a grade fixa e as aulas de hoje em diante passam para essa pessoa.
            </span>
          </div>
          {candidates.length ? (
            <Field label="Quem assume as aulas">
              <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} autoFocus>
                <option value="">Escolha um coach ou administrador</option>
                {candidates.map((c) => (
                  <option key={c.person_id} value={c.person_id}>
                    {c.name} · {ROLE_LABEL[c.role]}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-rose-700 dark:text-rose-300">Não há outro coach ou administrador ativo para assumir as aulas.</p>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-elevated px-3 py-2.5 text-sm text-fg-soft ring-1 ring-line">Este coach não tem turma fixa nem aula marcada: nada para transferir.</p>
      )}
    </Modal>
  )
}

/* ---------- lista ---------- */

/**
 * members: equipe já filtrada pela busca. staff: toda a equipe do box (para contar
 * administradores ativos e escolher o substituto, independentemente da busca).
 */
export default function EquipeGestao({ box, me, members, staff, notify, reload }) {
  const [showInactive, setShowInactive] = useState(false)
  // id (não o objeto): depois de recarregar, o modal mostra as aulas atualizadas
  const [deactivatingId, setDeactivatingId] = useState(null)
  const deactivating = deactivatingId ? staff.find((s) => s.person_id === deactivatingId) : null

  const activeOwners = staff.filter((m) => m.role === 'owner' && m.active !== false).length
  const team = members.filter((m) => m.role === 'owner' || m.role === 'coach')
  const active = team.filter((m) => m.active !== false).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1))
  const inactive = team.filter((m) => m.active === false)
  const candidates = useMemo(
    () => (deactivating ? staff.filter((s) => s.active !== false && s.person_id !== deactivating.person_id && (s.role === 'coach' || s.role === 'owner')) : []),
    [deactivating, staff],
  )

  const row = (m) => (
    <TeamRow key={m.person_id} m={m} boxId={box.id} me={me} activeOwners={activeOwners} onDeactivate={(x) => setDeactivatingId(x.person_id)} notify={notify} onChanged={reload} />
  )

  return (
    <>
      {active.length ? (
        <ul className="space-y-2">{active.map(row)}</ul>
      ) : (
        <p className="rounded-2xl bg-card px-6 py-8 text-center text-sm text-fg-muted ring-1 ring-line">Ninguém da equipe aqui.</p>
      )}

      {inactive.length > 0 && (
        <>
          <button onClick={() => setShowInactive((s) => !s)} className="mt-3 text-xs font-semibold text-fg-soft underline underline-offset-4 hover:text-fg">
            {showInactive ? 'Esconder inativos' : `Mostrar inativos (${inactive.length})`}
          </button>
          {showInactive && <ul className="mt-2 space-y-2">{inactive.map(row)}</ul>}
        </>
      )}

      {deactivating && deactivating.active !== false && (
        <DeactivateModal
          m={deactivating}
          boxId={box.id}
          candidates={candidates}
          notify={notify}
          onClose={() => setDeactivatingId(null)}
          onDone={(ok) => {
            if (ok) setDeactivatingId(null)
            reload()
          }}
        />
      )}
    </>
  )
}
