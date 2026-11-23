/*
 * Painel do administrador → Alunos → "Cadastrar alunos".
 *   • Individual: Nome, E-mail e CPF ou WhatsApp.
 *   • Em lote: cola a lista ou sobe um .csv (Nome, Email, CPF, Telefone), confere a prévia
 *     e confirma. Linhas com erro ficam de fora; as outras são criadas.
 * A conta já sai confirmada, com senha provisória = CPF (só números) ou, sem CPF, o
 * WhatsApp com DDD (só números). No 1º login o aluno define uma senha nova.
 * Regras no banco: admin_import_students (migrations/20261210_cadastro_em_lote.sql).
 */
import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileUp, KeyRound, Loader2, UserPlus, Users, XCircle } from 'lucide-react'
import * as api from '../lib/api/painel'
import { Modal } from '../avisos/shared'
import { maskPhone } from '../agenda/AuthScreen'
import { CSV_TEMPLATE, formatCpfInput, maskCpf, parseStudentList, readCsvFile } from '../lib/csvAlunos'

const inputCls =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 disabled:opacity-60'
const btn = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold ring-1 ring-line hover:bg-elevated disabled:opacity-60'
const primary = 'inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent-strong disabled:opacity-60'

/** Motivo de cada linha recusada (error_code de admin_import_students). */
const ROW_ERROR = {
  NOME_INVALIDO: 'Nome completo (nome e sobrenome).',
  EMAIL_INVALIDO: 'E-mail inválido.',
  CPF_INVALIDO: 'CPF inválido: confira os números.',
  TELEFONE_INVALIDO: 'WhatsApp inválido: use DDD + número.',
  SEM_CPF_TELEFONE: 'Informe CPF ou WhatsApp (vira a senha provisória).',
  EMAIL_REPETIDO_LISTA: 'E-mail repetido nesta lista.',
  CPF_REPETIDO_LISTA: 'CPF repetido nesta lista.',
  EMAIL_EM_USO: 'Este e-mail já tem conta no sistema.',
  CADASTRO_AMBIGUO: 'CPF/WhatsApp batem com mais de um cadastro do box. Cadastre pela recepção.',
  E_DA_EQUIPE: 'Este cadastro é da equipe do box.',
  JA_TEM_CONTA: 'Este aluno já tem conta no app.',
  CPF_DIFERENTE: 'O aluno já está no box com outro CPF.',
  CADASTRO_DUPLICADO: 'Já existe um cadastro igual no box.',
  ERRO_AO_CRIAR: 'Não foi possível criar esta conta. Tente de novo.',
}
const WARNING = { TELEFONE_COMPARTILHADO: 'Mesmo WhatsApp de outro cadastro (ex.: família).' }
const SOURCE = { cpf: 'CPF', telefone: 'WhatsApp' }

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  )
}

function PasswordRule() {
  return (
    <p className="rounded-xl bg-elevated px-3 py-2 text-xs text-fg-soft ring-1 ring-line">
      <b className="text-fg">Senha do 1º acesso:</b> o CPF só com números (ex.: 12345678900). Sem CPF, o WhatsApp com DDD só com números (ex.: 48999990001). No primeiro login o aluno escolhe uma senha nova.
    </p>
  )
}

/* ---------- resultado por linha ---------- */

function ResultRow({ r, src }) {
  const ok = r.result !== 'erro'
  const done = r.result === 'criado' || r.result === 'vinculado'
  const Icon = !ok ? XCircle : done ? CheckCircle2 : r.warning ? AlertTriangle : CheckCircle2
  const tone = !ok ? 'text-rose-600 dark:text-rose-300' : r.warning ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'
  const action = {
    novo: 'Nova conta',
    vincular: 'Já está no box: cria só o login',
    criado: 'Conta criada',
    vinculado: 'Login criado no cadastro existente',
  }[r.result]
  return (
    <li className="flex gap-2.5 px-3 py-2.5">
      <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-semibold">{r.row_name || '(sem nome)'}</span>
          {src?.line && <span className="text-[10px] text-fg-subtle">linha {src.line}</span>}
        </div>
        <div className="truncate text-fg-muted">
          {r.row_email || src?.email || '—'}
          {src?.cpf ? ` · CPF ${maskCpf(src.cpf)}` : ''}
          {src?.phone ? ` · ${src.phone}` : ''}
        </div>
        {ok ? (
          <div className="mt-0.5 text-fg-soft">
            {action}
            {r.password_source && <> · senha: <b className="text-fg">{SOURCE[r.password_source]}</b></>}
            {r.warning && <span className="block text-amber-700 dark:text-amber-300">{WARNING[r.warning] || r.warning}</span>}
          </div>
        ) : (
          <div className="mt-0.5 font-semibold text-rose-600 dark:text-rose-300">{ROW_ERROR[r.error_code] || r.error_code}</div>
        )}
      </div>
    </li>
  )
}

function Summary({ results, final }) {
  const bad = results.filter((r) => r.result === 'erro').length
  const good = results.length - bad
  return (
    <div className="grid grid-cols-2 gap-2 text-center">
      <div className="rounded-xl bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/30">
        <div className="font-display text-2xl font-bold text-emerald-700 dark:text-emerald-300">{good}</div>
        <div className="text-[11px] text-fg-muted">{final ? 'criados' : 'prontos para criar'}</div>
      </div>
      <div className={`rounded-xl px-3 py-2 ring-1 ${bad ? 'bg-rose-500/10 ring-rose-500/30' : 'bg-elevated ring-line'}`}>
        <div className={`font-display text-2xl font-bold ${bad ? 'text-rose-600 dark:text-rose-300' : 'text-fg-subtle'}`}>{bad}</div>
        <div className="text-[11px] text-fg-muted">{final ? 'não criados' : 'com problema (ficam de fora)'}</div>
      </div>
    </div>
  )
}

/* ---------- individual ---------- */

const EMPTY = { name: '', email: '', cpf: '', phone: '' }

function Individual({ box, notify, onCreated }) {
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, fmt = (v) => v) => (e) => setF((x) => ({ ...x, [k]: fmt(e.target.value) }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.cpf.trim() && !f.phone.trim()) return setError(ROW_ERROR.SEM_CPF_TELEFONE)
    setBusy(true)
    const res = await api.importStudents({ boxId: box.id, rows: [f], dryRun: false })
    setBusy(false)
    if (!res.ok) return setError(res.message)
    const r = res.data?.[0]
    if (!r || r.result === 'erro') return setError(ROW_ERROR[r?.error_code] || 'Não foi possível cadastrar.')
    notify(`${r.row_name.split(' ')[0]} cadastrado(a). Senha do 1º acesso: ${SOURCE[r.password_source]} só com números.`)
    setF(EMPTY)
    onCreated()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nome completo">
        <input value={f.name} onChange={set('name')} required autoComplete="off" placeholder="Maria Souza" className={inputCls} />
      </Field>
      <Field label="E-mail" hint="É o login do aluno.">
        <input type="email" value={f.email} onChange={set('email')} required autoComplete="off" inputMode="email" placeholder="maria@email.com" className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="CPF">
          <input value={f.cpf} onChange={set('cpf', formatCpfInput)} inputMode="numeric" autoComplete="off" placeholder="123.456.789-00" className={inputCls} />
        </Field>
        <Field label="WhatsApp">
          <input type="tel" value={f.phone} onChange={set('phone', maskPhone)} inputMode="tel" autoComplete="off" placeholder="(48) 99999-0000" className={inputCls} />
        </Field>
      </div>
      <PasswordRule />
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Cadastrar aluno
      </button>
    </form>
  )
}

/* ---------- em lote ---------- */

function Lote({ box, notify, onCreated }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState(null) // linhas lidas da lista
  const [preview, setPreview] = useState(null) // resposta do dry run
  const [final, setFinal] = useState(null) // resposta da criação
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const reset = () => {
    setRows(null)
    setPreview(null)
    setFinal(null)
    setError('')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setError('Arquivo grande demais (máx. 2 MB).')
    try {
      setText(await readCsvFile(file))
      setFileName(file.name)
      reset()
    } catch {
      setError('Não foi possível ler o arquivo. Salve a planilha como .csv e tente de novo.')
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'modelo-alunos.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }

  const doPreview = async () => {
    reset()
    const parsed = parseStudentList(text)
    if (parsed.error) return setError(parsed.error)
    if (parsed.rows.length > 500) return setError(`A lista tem ${parsed.rows.length} alunos. Envie no máximo 500 por vez.`)
    setBusy(true)
    const res = await api.importStudents({ boxId: box.id, rows: parsed.rows.map(({ line, ...r }) => r), dryRun: true })
    setBusy(false)
    if (!res.ok) return setError(res.message)
    setRows(parsed.rows)
    setPreview(res.data || [])
  }

  const doCreate = async () => {
    const okIdx = preview.filter((r) => r.result !== 'erro').map((r) => r.row_index - 1)
    if (!okIdx.length) return
    setBusy(true)
    const send = okIdx.map((i) => rows[i])
    const res = await api.importStudents({ boxId: box.id, rows: send.map(({ line, ...r }) => r), dryRun: false })
    setBusy(false)
    if (!res.ok) return setError(res.message)
    // linhas devolvidas na ordem enviada: guarda a linha original de cada uma
    const data = (res.data || []).map((r) => ({ ...r, _src: send[r.row_index - 1] }))
    const skipped = preview.filter((r) => r.result === 'erro').map((r) => ({ ...r, _src: rows[r.row_index - 1] }))
    const all = [...data, ...skipped]
    setFinal(all)
    const created = data.filter((r) => r.result !== 'erro').length
    notify(created ? `${plural(created, 'aluno cadastrado', 'alunos cadastrados')}.` : 'Nenhuma conta criada.', created ? 'ok' : 'err')
    if (created) onCreated()
  }

  if (final) {
    return (
      <div className="space-y-3">
        <Summary results={final} final />
        <PasswordRule />
        <ul className="divide-y divide-line overflow-hidden rounded-xl bg-card ring-1 ring-line">
          {final.map((r, i) => <ResultRow key={i} r={r} src={r._src} />)}
        </ul>
        <button onClick={() => { reset(); setText(''); setFileName('') }} className={primary}>
          Cadastrar outra lista
        </button>
      </div>
    )
  }

  if (preview) {
    const okCount = preview.filter((r) => r.result !== 'erro').length
    return (
      <div className="space-y-3">
        <Summary results={preview} />
        <ul className="max-h-[45dvh] divide-y divide-line overflow-y-auto rounded-xl bg-card ring-1 ring-line">
          {preview.map((r) => <ResultRow key={r.row_index} r={r} src={rows[r.row_index - 1]} />)}
        </ul>
        {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
        <button onClick={doCreate} disabled={busy || !okCount} className={primary}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
          {okCount ? `Criar ${plural(okCount, 'conta', 'contas')}` : 'Nenhuma linha para criar'}
        </button>
        <button onClick={reset} disabled={busy} className={`${btn} w-full`}>
          Voltar e corrigir a lista
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        Colunas: <b className="text-fg">Nome, Email, CPF, Telefone</b>. Com cabeçalho, em qualquer ordem; sem cabeçalho, nessa ordem. Separador <b className="text-fg">;</b>, <b className="text-fg">,</b> ou tab (copiar e colar do Excel funciona).
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
          <FileUp size={14} /> Escolher arquivo .csv
        </button>
        <button type="button" onClick={downloadTemplate} className={btn}>
          <Download size={14} /> Baixar modelo
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
      </div>
      {fileName && <p className="text-[11px] text-fg-subtle">Arquivo: {fileName}</p>}
      <Field label="Ou cole a lista">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setFileName('') }}
          rows={7}
          spellCheck={false}
          placeholder={'Nome;Email;CPF;Telefone\nMaria Souza;maria@email.com;123.456.789-09;(48) 99999-0001'}
          className={`${inputCls} font-mono text-xs`}
        />
      </Field>
      <PasswordRule />
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      <button onClick={doPreview} disabled={busy || !text.trim()} className={primary}>
        {busy && <Loader2 size={16} className="animate-spin" />} Ver prévia
      </button>
    </div>
  )
}

/* ---------- botão + modal ---------- */

export default function CadastroAlunos({ box, notify, onCreated }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('individual')
  return (
    <>
      <button onClick={() => setOpen(true)} className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-line transition hover:ring-line-strong">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <UserPlus size={18} />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <b className="block text-fg">Cadastrar alunos</b>
          <span className="text-xs text-fg-muted">Um por vez ou a lista toda (planilha .csv). A senha inicial é o CPF ou o WhatsApp.</span>
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cadastrar alunos">
        <div role="tablist" className="mb-4 flex gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
          {[
            ['individual', 'Individual'],
            ['lote', 'Em lote'],
          ].map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase ${mode === k ? 'bg-inverse text-on-inverse' : 'text-fg-muted hover:text-fg'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {mode === 'individual' ? <Individual box={box} notify={notify} onCreated={onCreated} /> : <Lote box={box} notify={notify} onCreated={onCreated} />}
      </Modal>
    </>
  )
}

/* ---------- lista de alunos: resetar senha ---------- */

/** "Resetar senha para CPF/Contato": confirma, reseta e marca o 1º acesso de novo. */
export function ResetPasswordButton({ box, m, access, notify, onChanged }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!access?.can_reset) return null
  const label = access.reset_source === 'cpf' ? 'CPF' : 'WhatsApp'
  const go = async () => {
    setBusy(true)
    const res = await api.resetStudentPassword({ boxId: box.id, personId: m.person_id })
    setBusy(false)
    setConfirm(false)
    notify(res.message, res.ok ? 'ok' : 'err')
    if (res.ok) onChanged()
  }
  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className={btn}>
        <KeyRound size={14} /> Resetar senha para {label}
      </button>
    )
  }
  return (
    <div className="w-full rounded-xl bg-amber-500/10 p-3 text-xs ring-1 ring-amber-500/30">
      <p className="text-fg-soft">
        A senha de <b className="text-fg">{m.name.split(' ')[0]}</b> volta a ser o {label} só com números e o aluno sai do app nos aparelhos em que estiver logado. No próximo login ele define uma senha nova.
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={go} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-60">
          {busy && <Loader2 size={12} className="animate-spin" />} Confirmar reset
        </button>
        <button onClick={() => setConfirm(false)} disabled={busy} className="px-2 text-xs font-semibold text-fg-muted hover:text-fg">
          Cancelar
        </button>
      </div>
    </div>
  )
}
