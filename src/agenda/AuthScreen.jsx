/*
 * Acesso do aluno: Entrar, Criar conta, Esqueci a senha e Nova senha.
 * Login por e-mail e senha (Supabase Auth). "Criar conta" abre o auto-cadastro em
 * etapas (signup/SignupWizard.jsx); o modo 'signup' daqui é para quem já tem cadastro
 * feito pelo box (liga pelo telefone — ver supabase/migrations/20261121_login_email.sql).
 */
import { useState } from 'react'
import { Eye, EyeOff, FlaskConical, Loader2, MailCheck } from 'lucide-react'
import * as api from '../lib/api/agenda'

export const input =
  'w-full rounded-xl border border-line bg-card px-3 py-3 text-base text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  )
}

export function PasswordInput({ value, onChange, autoComplete, placeholder = 'Mínimo de 6 caracteres' }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        minLength={6}
        className={`${input} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-fg-subtle hover:text-fg"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

// (48) 99999-0001 enquanto digita
export function maskPhone(v) {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function Submit({ busy, children }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-on-accent transition hover:bg-accent-strong active:scale-[.98] disabled:opacity-60"
    >
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

export function ErrorBox({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
      {children}
    </p>
  )
}

export const linkBtn = 'font-semibold text-fg underline decoration-accent decoration-2 underline-offset-4 hover:text-highlight'

/**
 * @param {'login'|'signup'|'forgot'|'reset'} initialMode
 * onDone()  → entrou / trocou a senha (a página recarrega quem está logado)
 * onTest()  → abre o seletor de aluno de teste (só se o box tiver test_login_enabled)
 * onSignup() → abre o auto-cadastro em etapas (quem ainda não é aluno do box)
 */
export default function AuthScreen({ box, slug, initialMode = 'login', onDone, onTest, onSignup, notify, loginText }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null) // { kind: 'confirm' | 'reset', email }

  const go = (m) => {
    setMode(m)
    setError('')
    setPassword('')
  }

  const submit = (fn) => async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const doLogin = submit(async () => {
    const res = await api.signIn(email, password)
    if (!res.ok) return setError(res.message)
    onDone()
  })

  const doSignup = submit(async () => {
    const res = await api.signUp({ boxId: box.id, slug, phone, email, password })
    if (!res.ok) return setError(res.message)
    if (res.needsConfirmation) setSent({ kind: 'confirm', email })
    else onDone()
  })

  const doForgot = submit(async () => {
    const res = await api.sendPasswordReset(email, slug)
    if (!res.ok) return setError(res.message)
    setSent({ kind: 'reset', email })
  })

  const doReset = submit(async () => {
    const res = await api.updatePassword(password)
    if (!res.ok) return setError(res.message)
    notify(res.message)
    onDone()
  })

  if (sent) {
    return (
      <section className="flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center ring-1 ring-line">
        <MailCheck size={32} className="text-highlight" />
        <h1 className="mt-3 font-display text-2xl font-bold uppercase">Confira seu e-mail</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {sent.kind === 'confirm' ? 'Enviamos um link de confirmação para ' : 'Se houver uma conta, enviamos um link para criar uma nova senha em '}
          <b className="text-fg">{sent.email}</b>.
        </p>
        <p className="mt-2 text-xs text-fg-subtle">Abra o link neste aparelho. Não chegou? Veja o spam ou aguarde alguns minutos.</p>
        <button onClick={() => { setSent(null); go('login') }} className={`mt-6 text-sm ${linkBtn}`}>
          Voltar para entrar
        </button>
      </section>
    )
  }

  const title = { login: 'Entrar', signup: 'Criar conta', forgot: 'Esqueci a senha', reset: 'Nova senha' }[mode]
  const subtitle = {
    login: loginText || `Acesse a agenda do ${box.name} para reservar suas aulas.`,
    signup: 'Para quem já é aluno: use o telefone que você informou no box. Ele liga sua conta ao seu cadastro e plano.',
    forgot: 'Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.',
    reset: 'Escolha a nova senha da sua conta.',
  }[mode]

  return (
    <section>
      <h1 className="font-display text-3xl font-bold uppercase">{title}</h1>
      <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>

      {mode === 'login' && (
        <form onSubmit={doLogin} className="mt-6 space-y-4">
          <Field label="E-mail">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="voce@email.com" required className={input} />
          </Field>
          <Field label="Senha">
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="Sua senha" />
          </Field>
          <div className="-mt-1 text-right">
            <button type="button" onClick={() => go('forgot')} className="text-sm font-semibold text-fg-soft hover:text-fg">
              Esqueci a senha
            </button>
          </div>
          <ErrorBox>{error}</ErrorBox>
          <Submit busy={busy}>Entrar</Submit>
          <p className="pt-2 text-center text-sm text-fg-muted">
            Primeira vez aqui?{' '}
            <button type="button" onClick={onSignup || (() => go('signup'))} className={linkBtn}>
              Criar conta
            </button>
          </p>
          {onSignup && (
            <p className="text-center text-xs text-fg-subtle">
              Já treina no box e a recepção tem seu cadastro?{' '}
              <button type="button" onClick={() => go('signup')} className="font-semibold text-fg-soft underline underline-offset-4 hover:text-fg">
                Criar conta com o telefone do cadastro
              </button>
            </p>
          )}
        </form>
      )}

      {mode === 'signup' && (
        <form onSubmit={doSignup} className="mt-6 space-y-4">
          <Field label="Telefone (WhatsApp)" hint="O mesmo número cadastrado no box.">
            <input type="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} autoComplete="tel-national" inputMode="tel" placeholder="(48) 99999-0000" required className={input} />
          </Field>
          <Field label="E-mail">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="voce@email.com" required className={input} />
          </Field>
          <Field label="Senha">
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <ErrorBox>{error}</ErrorBox>
          <Submit busy={busy}>Criar conta</Submit>
          <p className="pt-2 text-center text-sm text-fg-muted">
            Já tem conta?{' '}
            <button type="button" onClick={() => go('login')} className={linkBtn}>
              Entrar
            </button>
          </p>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={doForgot} className="mt-6 space-y-4">
          <Field label="E-mail">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="voce@email.com" required className={input} />
          </Field>
          <ErrorBox>{error}</ErrorBox>
          <Submit busy={busy}>Enviar link</Submit>
          <p className="pt-2 text-center text-sm">
            <button type="button" onClick={() => go('login')} className={linkBtn}>
              Voltar para entrar
            </button>
          </p>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={doReset} className="mt-6 space-y-4">
          <Field label="Nova senha">
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <ErrorBox>{error}</ErrorBox>
          <Submit busy={busy}>Salvar nova senha</Submit>
        </form>
      )}

      {onTest && mode !== 'reset' && (
        <button
          type="button"
          onClick={onTest}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-2.5 text-xs font-semibold text-fg-muted hover:text-fg"
        >
          <FlaskConical size={14} /> Entrar como aluno de teste
        </button>
      )}
    </section>
  )
}

/** Conta logada, mas sem cadastro ligado neste box (ex.: telefone digitado errado no cadastro). */
export function LinkAccount({ box, message, onLinked, onLogout, notify }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(message || '')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const res = await api.linkMyAccount(box.id, phone)
    setBusy(false)
    if (!res.ok) return setError(res.message)
    notify(res.message)
    onLinked()
  }

  return (
    <section>
      <h1 className="font-display text-3xl font-bold uppercase">Quase lá</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Sua conta está criada, mas ainda não encontramos seu cadastro no {box.name}. Informe o telefone que o box tem de você.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Telefone (WhatsApp)">
          <input type="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} autoComplete="tel-national" inputMode="tel" placeholder="(48) 99999-0000" required className={input} />
        </Field>
        <ErrorBox>{error}</ErrorBox>
        <Submit busy={busy}>Ligar ao meu cadastro</Submit>
        <p className="pt-2 text-center text-sm">
          <button type="button" onClick={onLogout} className={linkBtn}>
            Sair e usar outra conta
          </button>
        </p>
      </form>
    </section>
  )
}

/**
 * 1º acesso de conta criada pelo box (ou senha resetada): a senha atual é o CPF/WhatsApp.
 * Bloqueia a agenda até o aluno escolher uma senha nova (profiles.must_change_password).
 */
export function FirstAccess({ box, onDone, onLogout, notify }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    if (password !== confirm) return setError('As duas senhas não são iguais.')
    if (/^\d+$/.test(password) && password.length >= 10) {
      return setError('Não use o CPF ou o telefone como senha. Misture letras e números.')
    }
    setBusy(true)
    const res = await api.setFirstPassword(password)
    setBusy(false)
    if (!res.ok) return setError(res.message)
    notify(res.message)
    onDone()
  }

  return (
    <section>
      <h1 className="font-display text-3xl font-bold uppercase">Definir nova senha</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Bem-vindo(a) ao {box.name}! Você entrou com a senha provisória (CPF ou telefone). Para proteger sua conta, escolha uma senha só sua antes de usar a agenda.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Nova senha">
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        <Field label="Repita a nova senha">
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Digite de novo" />
        </Field>
        <ErrorBox>{error}</ErrorBox>
        <Submit busy={busy}>Salvar e entrar</Submit>
        <p className="pt-2 text-center text-sm">
          <button type="button" onClick={onLogout} className={linkBtn}>
            Sair
          </button>
        </p>
      </form>
    </section>
  )
}
