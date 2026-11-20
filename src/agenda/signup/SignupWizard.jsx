/*
 * Auto-cadastro do aluno em 3 etapas (rota /clientes/:slug/agenda → "Criar conta").
 *
 *   1. Dados e acesso   → nome, WhatsApp, nascimento, e-mail e senha
 *   2. Plano            → catálogo do box (get_signup_plans) ou aula experimental
 *   3. Saúde e termo    → PAR-Q + consentimento LGPD
 *
 * No fim, selfSignUp() cria a conta e grava tudo numa RPC só (self_signup).
 * Link de indicação (?ref=CODIGO): o código vai junto no self_signup (Indique e Ganhe).
 * Regras e validações no banco: supabase/migrations/20261122_auto_cadastro.sql.
 *
 * mode="finish": a conta já existe e está logada, mas o cadastro não foi gravado
 * (ex.: queda de conexão no fim). Pula e-mail/senha e só termina o cadastro.
 */
import { useState } from 'react'
import { ArrowLeft, Gift, MailCheck } from 'lucide-react'
import * as api from '../../lib/api/agenda'
import { ErrorBox, Field, PasswordInput, Submit, input, linkBtn, maskPhone } from '../AuthScreen'
import PlanStep from './PlanStep'
import HealthStep, { EMPTY_HEALTH, healthIsComplete } from './HealthStep'

const STEPS = ['Seus dados', 'Plano', 'Saúde e termo']

function Progress({ step }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider">
        <span className="text-highlight">Etapa {step + 1} de {STEPS.length}</span>
        <span className="text-fg-subtle">{STEPS[step]}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Progresso do cadastro">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1.5 rounded-full transition-colors duration-300 ${i <= step ? 'bg-accent' : 'bg-elevated ring-1 ring-line'}`} />
        ))}
      </div>
    </div>
  )
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// Nome e sobrenome, sem números
const nameOk = (n) => /^\S{2,}(\s+\S+)+$/.test(n.trim()) && !/\d/.test(n)
const phoneOk = (p) => p.replace(/\D/g, '').length >= 10

/**
 * onDone()      → cadastro gravado e logado: a página recarrega quem está logado (vai para a agenda)
 * onCancel()    → volta para "Entrar"
 * onExisting()  → "Já sou aluno do box" (cria a conta pelo telefone do cadastro)
 * prefill       → { name, phone } do user_metadata no modo "finish"
 */
export default function SignupWizard({ box, slug, mode = 'new', prefill, onDone, onCancel, onExisting, notify }) {
  const finishing = mode === 'finish'
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => ({
    name: prefill?.name || '',
    phone: prefill?.phone ? maskPhone(prefill.phone) : '',
    birthDate: '',
    email: '',
    password: '',
    trial: false,
    planId: null,
    health: EMPTY_HEALTH,
    consent: false,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState(null)
  const [referred] = useState(() => Boolean(api.readReferral(box.id)))

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const goTo = (s) => {
    setError('')
    setStep(s)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Etapa 1 → confere WhatsApp e idade no banco antes de seguir (evita erro só no fim)
  const nextFromData = async (e) => {
    e.preventDefault()
    if (!nameOk(form.name)) return setError('Informe seu nome completo (nome e sobrenome).')
    if (!phoneOk(form.phone)) return setError('WhatsApp inválido. Use DDD + número, ex.: (48) 99999-0000.')
    if (!form.birthDate) return setError('Informe sua data de nascimento.')
    if (!finishing && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('E-mail inválido.')
    if (!finishing && form.password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    setBusy(true)
    setError('')
    const res = await api.checkSelfSignup(box.id, form.phone, form.birthDate)
    setBusy(false)
    if (!res.ok) return setError(res.message)
    goTo(1)
  }

  const nextFromPlan = () => {
    if (!form.trial && !form.planId) return setError('Escolha um plano ou a aula experimental.')
    goTo(2)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!healthIsComplete(form.health)) return setError('Responda Sim ou Não em todas as perguntas.')
    if (!form.consent) return setError('Para continuar, aceite o Termo de Responsabilidade e o consentimento LGPD.')
    setBusy(true)
    setError('')
    const res = finishing ? await api.finishSelfSignUp({ boxId: box.id, form }) : await api.selfSignUp({ boxId: box.id, slug, form })
    setBusy(false)
    if (!res.ok) {
      // problema nos dados da etapa 1: volta para lá com a mensagem
      if (['TELEFONE_INVALIDO', 'TELEFONE_JA_CADASTRADO', 'DATA_INVALIDA', 'MENOR_DE_IDADE', 'NOME_INVALIDO', 'AUTH'].includes(res.code)) {
        setStep(0)
      } else if (res.code === 'PLANO_INVALIDO') {
        setStep(1)
      }
      return setError(res.message)
    }
    if (res.needsConfirmation) return setSentTo(form.email.trim())
    notify(res.message || `Bem-vindo(a) ao ${box.name}! 💪`)
    onDone()
  }

  if (sentTo) {
    return (
      <section className="flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center ring-1 ring-line">
        <MailCheck size={32} className="text-highlight" />
        <h1 className="mt-3 font-display text-2xl font-bold uppercase">Cadastro feito!</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Falta só confirmar seu e-mail. Enviamos um link para <b className="text-fg">{sentTo}</b>.
        </p>
        <p className="mt-2 text-sm text-fg-muted">Ao abrir o link, você entra direto na agenda do {box.name}.</p>
        <p className="mt-3 text-xs text-fg-subtle">Abra o link neste aparelho. Não chegou? Veja o spam ou aguarde alguns minutos.</p>
        <button onClick={onCancel} className={`mt-6 text-sm ${linkBtn}`}>
          Já confirmei: entrar
        </button>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={step === 0 ? onCancel : () => goTo(step - 1)}
          aria-label={step === 0 ? 'Voltar para entrar' : 'Etapa anterior'}
          className="-ml-1.5 rounded-full p-1.5 text-fg-muted hover:bg-card hover:text-fg"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-3xl font-bold uppercase">{finishing ? 'Termine seu cadastro' : 'Criar conta'}</h1>
      </div>
      <Progress step={step} />

      {step === 0 && (
        <form onSubmit={nextFromData} className="animate-slideup space-y-4" noValidate>
          <p className="text-sm text-fg-muted">Leva uns 2 minutos. Seus dados ficam só com o {box.name}.</p>
          {referred && (
            <p className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm text-fg ring-1 ring-accent/30">
              <Gift size={16} className="shrink-0 text-highlight" /> Você foi indicado(a) por um amigo do box. Bem-vindo(a)!
            </p>
          )}
          <Field label="Nome completo">
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" placeholder="Nome e sobrenome" required className={input} />
          </Field>
          <Field label="WhatsApp" hint="Avisos de aula, lista de espera e cobrança chegam por aqui.">
            <input type="tel" value={form.phone} onChange={(e) => set({ phone: maskPhone(e.target.value) })} autoComplete="tel-national" inputMode="tel" placeholder="(48) 99999-0000" required className={input} />
          </Field>
          <Field label="Data de nascimento">
            <input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} max={todayIso()} min="1920-01-01" autoComplete="bday" required className={`${input} min-h-[50px]`} />
          </Field>
          {!finishing && (
            <>
              <Field label="E-mail">
                <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" inputMode="email" placeholder="voce@email.com" required className={input} />
              </Field>
              <Field label="Senha">
                <PasswordInput value={form.password} onChange={(v) => set({ password: v })} autoComplete="new-password" />
              </Field>
            </>
          )}
          <ErrorBox>{error}</ErrorBox>
          <Submit busy={busy}>Continuar</Submit>
          {!finishing && (
            <div className="space-y-2 pt-2 text-center text-sm text-fg-muted">
              <p>
                Já tem conta?{' '}
                <button type="button" onClick={onCancel} className={linkBtn}>
                  Entrar
                </button>
              </p>
              <p className="text-xs text-fg-subtle">
                Já treina no box e a recepção tem seu cadastro?{' '}
                <button type="button" onClick={onExisting} className="font-semibold text-fg-soft underline underline-offset-4 hover:text-fg">
                  Use o telefone do cadastro
                </button>
              </p>
            </div>
          )}
        </form>
      )}

      {step === 1 && (
        <div className="animate-slideup space-y-4">
          <PlanStep
            boxId={box.id}
            trial={form.trial}
            planId={form.planId}
            onChange={(patch) => {
              setError('')
              set(patch)
            }}
          />
          <ErrorBox>{error}</ErrorBox>
          <button
            type="button"
            onClick={nextFromPlan}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-on-accent transition hover:bg-accent-strong active:scale-[.98]"
          >
            Continuar
          </button>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={submit} className="animate-slideup space-y-4" noValidate>
          <HealthStep
            box={box}
            health={form.health}
            consent={form.consent}
            onHealth={(update) => setForm((f) => ({ ...f, health: update(f.health) }))}
            onConsent={(consent) => {
              setError('')
              set({ consent })
            }}
          />
          <ErrorBox>{error}</ErrorBox>
          <Submit busy={busy}>{form.trial ? 'Criar conta e agendar experimental' : 'Criar conta e ir para a agenda'}</Submit>
        </form>
      )}
    </section>
  )
}
