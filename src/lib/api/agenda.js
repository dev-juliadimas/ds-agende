/*
 * API da Agenda do Aluno (rota /clientes/:slug/agenda).
 * Só chama RPCs de supabase/migrations/20261120_agenda_aluno.sql — nenhuma regra aqui.
 *
 * Ações devolvem o formato de rpc.js, pronto para o Toast:
 *   { ok: true, data, message } | { ok: false, code, message }   (nunca lançam)
 */
import { requireSupabase } from '../supabase'
import { toFriendlyError } from './errors'

async function call(fn, params, successMessage) {
  try {
    const { data, error } = await requireSupabase().rpc(fn, params)
    if (error) return { ok: false, ...toFriendlyError(error) }
    const message = typeof successMessage === 'function' ? successMessage(data) : successMessage
    return { ok: true, data, message }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

/** Box pelo slug do banco (boxes.slug). null se não existir. */
export async function getBoxPublic(slug) {
  const { data, error } = await requireSupabase().rpc('get_box_public', { p_slug: slug })
  if (error) throw error
  return data?.[0] || null
}

/** Contato público do box (endereço, Instagram, WhatsApp) pelo boxes.slug. null se não existir. */
export async function getBoxContact(slug) {
  const { data, error } = await requireSupabase().rpc('get_box_contact', { p_slug: slug })
  if (error) throw error
  return data?.[0] || null
}

/** Aulas de hoje + próximos dias, com a situação de quem está logado. */
export async function fetchAgenda(boxId, days = 7) {
  const { data, error } = await requireSupabase().rpc('get_agenda', { p_box: boxId, p_days: days })
  if (error) throw error
  return data || []
}

/** Pessoa ligada ao usuário logado neste box (null se não houver). */
export async function fetchMe(boxId) {
  const { data, error } = await requireSupabase().rpc('my_person', { p_box: boxId })
  if (error) throw error
  return data?.id ? data : null
}

export function bookClass({ sessionId, personId }) {
  return call('app_book_class', { p_session: sessionId, p_person: personId, p_waitlist: false }, 'Vaga garantida! Bom treino 💪')
}

/**
 * Limite da semana cheio: cancela `cancelBookingId` e reserva `sessionId` numa transação só
 * (se a reserva nova falhar, o cancelamento é desfeito). migrations/20261204_troca_de_aula.sql
 */
export function swapBooking({ cancelBookingId, sessionId, personId }) {
  return call(
    'app_swap_booking',
    { p_cancel: cancelBookingId, p_session: sessionId, p_person: personId },
    'Aula trocada! A antiga foi cancelada e a nova está garantida 💪',
  )
}

export function joinWaitlist({ sessionId, personId }) {
  return call(
    'app_book_class',
    { p_session: sessionId, p_person: personId, p_waitlist: true },
    (d) =>
      d?.result === 'reservado'
        ? 'Abriu uma vaga e ela já é sua! 💪'
        : `Você está na lista de espera (${d?.position}º). Se abrir vaga, você entra sozinho.`,
  )
}

export function cancelBooking({ bookingId }) {
  // result 'late_cancel' = cancelou dentro do prazo (boxes.min_cancel_minutes): a vaga é
  // liberada, mas a aula continua contando no limite semanal
  return call('app_cancel_booking', { p_booking: bookingId }, (d) => {
    const vaga = d?.promoted ? 'A vaga foi para o 1º da lista de espera.' : 'Sua vaga foi liberada.'
    return d?.result === 'late_cancel'
      ? `Cancelamento em cima da hora registrado. ${vaga} Esta aula conta no limite da semana.`
      : `Reserva cancelada. ${vaga}`
  })
}

export function leaveWaitlist({ sessionId }) {
  return call('app_leave_waitlist', { p_session: sessionId }, 'Você saiu da lista de espera.')
}

/* ---------- login de teste (temporário) ---------- */

export async function listTestPeople(boxId) {
  const { data, error } = await requireSupabase().rpc('list_test_people', { p_box: boxId })
  if (error) throw error
  return data || []
}

/**
 * Entra como um aluno de teste: cria (ou reaproveita) um usuário anônimo do
 * Supabase e liga ele ao cadastro escolhido em `people`.
 */
export async function loginAsTestPerson(personId) {
  try {
    const sb = requireSupabase()
    const { data: s } = await sb.auth.getSession()
    if (!s.session) {
      const { error } = await sb.auth.signInAnonymously()
      if (error) {
        if (/anonymous/i.test(error.message)) {
          return {
            ok: false,
            code: 'ANON_DESATIVADO',
            message: 'Login de teste indisponível: ligue "Allow anonymous sign-ins" no painel do Supabase.',
          }
        }
        return { ok: false, ...toFriendlyError(error) }
      }
    }
    return call('claim_test_person', { p_person: personId }, (p) => `Olá, ${p?.name?.split(' ')[0]}!`)
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

export async function signOut() {
  try {
    await requireSupabase().auth.signOut()
  } catch {
    /* sem sessão: nada a fazer */
  }
}

/* ---------- login por e-mail e senha (migrations/20261121_login_email.sql) ---------- */

/** Tradução dos erros do Supabase Auth (vêm em inglês). */
export function authError(err) {
  const m = String(err?.message || '')
  const map = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/email not confirmed/i, 'Confirme seu e-mail: abra o link que enviamos para você.'],
    [/already registered|already been registered/i, 'Este e-mail já tem conta. Entre ou use "Esqueci a senha".'],
    [/should be different/i, 'A nova senha precisa ser diferente da atual.'],
    [/password should be at least|password.*(short|length)/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/weak password|pwned/i, 'Senha muito fácil. Escolha outra.'],
    [/rate limit|security purposes|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'],
    [/invalid.*email|email.*invalid|validate email/i, 'E-mail inválido.'],
    [/signups not allowed|signup.*disabled/i, 'Cadastro desativado no momento. Fale com a recepção.'],
  ]
  const hit = map.find(([re]) => re.test(m))
  return hit ? { ok: false, code: 'AUTH', message: hit[1] } : { ok: false, ...toFriendlyError(err) }
}

/** Endereço da agenda para os links do e-mail (confirmação e nova senha). */
export const agendaUrl = (slug, query = '') =>
  `${window.location.origin}${import.meta.env.BASE_URL}clientes/${slug}/agenda${query}`

/** 'ok' | 'nao_cadastrado' | 'ja_tem_conta' */
export async function checkSignupPhone(boxId, phone) {
  const { data, error } = await requireSupabase().rpc('check_signup_phone', { p_box: boxId, p_phone: phone })
  if (error) throw error
  return data
}

export async function signIn(email, password) {
  try {
    const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password })
    return error ? authError(error) : { ok: true }
  } catch (err) {
    return authError(err)
  }
}

/**
 * Cria a conta. Antes confere se o telefone está cadastrado no box.
 * Retorno ok: { needsConfirmation: true } quando o Supabase exige confirmar o e-mail.
 */
export async function signUp({ boxId, slug, phone, email, password }) {
  try {
    const check = await checkSignupPhone(boxId, phone)
    if (check === 'nao_cadastrado') {
      return { ok: false, code: 'TELEFONE_NAO_CADASTRADO', message: 'Não achamos esse telefone no cadastro do box. Confira o número ou fale com a recepção.' }
    }
    if (check === 'ja_tem_conta') {
      return { ok: false, code: 'TELEFONE_JA_TEM_CONTA', message: 'Esse telefone já tem uma conta. Entre com seu e-mail ou use "Esqueci a senha".' }
    }
    const sb = requireSupabase()
    const { data: cur } = await sb.auth.getSession()
    if (cur.session?.user?.is_anonymous) await sb.auth.signOut() // sai do login de teste antes
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { box_id: boxId, phone }, emailRedirectTo: agendaUrl(slug) },
    })
    if (error) return authError(error)
    // e-mail já cadastrado: o Supabase devolve um usuário "falso" sem identidades
    if (data.user && data.user.identities?.length === 0) {
      return { ok: false, code: 'AUTH', message: 'Este e-mail já tem conta. Entre ou use "Esqueci a senha".' }
    }
    return { ok: true, needsConfirmation: !data.session }
  } catch (err) {
    return authError(err)
  }
}

export async function sendPasswordReset(email, slug) {
  try {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: agendaUrl(slug, '?redefinir=1') })
    return error ? authError(error) : { ok: true }
  } catch (err) {
    return authError(err)
  }
}

export async function updatePassword(password) {
  try {
    const { error } = await requireSupabase().auth.updateUser({ password })
    return error ? authError(error) : { ok: true, message: 'Senha alterada! Você já está conectado.' }
  } catch (err) {
    return authError(err)
  }
}

/** Liga a conta logada ao aluno do box (pelo telefone do cadastro ou o informado). */
export function linkMyAccount(boxId, phone = null) {
  return call('link_my_account', { p_box: boxId, p_phone: phone }, (p) => `Conta ligada. Bem-vindo(a), ${p?.name?.split(' ')[0]}!`)
}

/* ---------- auto-cadastro (migrations/20261122_auto_cadastro.sql) ---------- */

/** Versão do Termo de Responsabilidade + LGPD aceito (vai para health_forms.consent_version). */
export const CONSENT_VERSION = 'termo-lgpd-v1-2026-11'

/** Planos que o aluno pode escolher sozinho (sem login). */
export async function fetchSignupPlans(boxId) {
  const { data, error } = await requireSupabase().rpc('get_signup_plans', { p_box: boxId })
  if (error) throw error
  return data || []
}

const SIGNUP_CHECK = {
  telefone_invalido: 'TELEFONE_INVALIDO',
  telefone_ja_cadastrado: 'TELEFONE_JA_CADASTRADO',
  data_invalida: 'DATA_INVALIDA',
  menor_de_idade: 'MENOR_DE_IDADE',
}

/** Confere WhatsApp e data de nascimento antes de criar a conta. */
export async function checkSelfSignup(boxId, phone, birthDate) {
  try {
    const { data, error } = await requireSupabase().rpc('check_self_signup', { p_box: boxId, p_phone: phone, p_birth: birthDate })
    if (error) return { ok: false, ...toFriendlyError(error) }
    if (data === 'ok') return { ok: true }
    const code = SIGNUP_CHECK[data]
    return { ok: false, ...toFriendlyError({ message: code || data }) }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

/* ---------- Indique e Ganhe (migrations/20261130_indique_ganhe.sql) ---------- */

const REF_KEY = (boxId) => `dsagende:ref:${boxId}`
const cleanRef = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)

/**
 * Guarda o ?ref=CODIGO da URL para o cadastro (sobrevive a ir em "Entrar" e voltar).
 * Devolve o código lido (ou o já guardado). Só vale para este box.
 */
export function rememberReferral(boxId) {
  const fromUrl = cleanRef(new URLSearchParams(window.location.search).get('ref'))
  try {
    if (fromUrl) sessionStorage.setItem(REF_KEY(boxId), fromUrl)
  } catch {
    /* modo privado: usa só o da URL */
  }
  return fromUrl || readReferral(boxId)
}

export function readReferral(boxId) {
  const fromUrl = cleanRef(new URLSearchParams(window.location.search).get('ref'))
  if (fromUrl) return fromUrl
  try {
    return cleanRef(sessionStorage.getItem(REF_KEY(boxId))) || null
  } catch {
    return null
  }
}

/** { code, pending, earned, used } de quem está logado. Gera o código na 1ª vez. */
export async function fetchMyReferral(boxId) {
  const { data, error } = await requireSupabase().rpc('my_referral', { p_box: boxId })
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data?.[0] || null
}

export function clearReferral(boxId) {
  try {
    sessionStorage.removeItem(REF_KEY(boxId))
  } catch {
    /* nada guardado */
  }
}

export const referralUrl = (slug, code) => agendaUrl(slug, `?ref=${encodeURIComponent(code)}`)

const randomNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')

function signupParams({ userId, nonce, boxId, form }) {
  return {
    p_user: userId,
    p_nonce: nonce,
    p_box: boxId,
    p_name: form.name,
    p_phone: form.phone,
    p_birth: form.birthDate,
    p_plan: form.trial ? null : form.planId,
    p_trial: form.trial,
    p_health: form.health,
    p_consent: form.consent,
    p_consent_version: CONSENT_VERSION,
    p_ref: readReferral(boxId),
  }
}

/**
 * Cria a conta (Supabase Auth) e grava cadastro + plano + anamnese numa RPC só.
 *
 * form = { name, phone, birthDate: 'AAAA-MM-DD', email, password,
 *          trial: boolean, planId, health: {...}, consent: true }
 *
 * Retorno ok: { needsConfirmation } — true quando o projeto exige confirmar o e-mail
 * (os dados já ficam salvos; ao abrir o link o aluno cai na agenda).
 */
export async function selfSignUp({ boxId, slug, form }) {
  try {
    const check = await checkSelfSignup(boxId, form.phone, form.birthDate)
    if (!check.ok) return check

    const sb = requireSupabase()
    const { data: cur } = await sb.auth.getSession()
    if (cur.session) await sb.auth.signOut() // sai do login de teste / outra conta antes

    const nonce = randomNonce()
    const { data, error } = await sb.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        // só o que não é sensível: nada de saúde no user_metadata (ele vai dentro do JWT)
        data: { full_name: form.name, phone: form.phone, self_signup: { box_id: boxId, nonce } },
        emailRedirectTo: agendaUrl(slug),
      },
    })
    if (error) return authError(error)
    if (data.user && data.user.identities?.length === 0) {
      return { ok: false, code: 'AUTH', message: 'Este e-mail já tem conta. Entre ou use "Esqueci a senha".' }
    }

    const res = await call('self_signup', signupParams({ userId: data.user.id, nonce, boxId, form }))
    if (!res.ok) return res
    clearReferral(boxId)
    return { ok: true, needsConfirmation: !data.session, person: res.data }
  } catch (err) {
    return authError(err)
  }
}

/** Conta já logada sem cadastro no box (o self_signup falhou na 1ª vez): termina o cadastro. */
export async function finishSelfSignUp({ boxId, form }) {
  try {
    const { data } = await requireSupabase().auth.getUser()
    if (!data.user) return { ok: false, ...toFriendlyError({ message: 'NAO_AUTENTICADO' }) }
    return call('self_signup', signupParams({ userId: data.user.id, nonce: null, boxId, form }), (p) => `Cadastro concluído. Bem-vindo(a), ${p?.name?.split(' ')[0]}!`)
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

/** { financial_status, plan_name, pending_amount } de quem está logado (null se não houver). */
export async function fetchMySignupStatus(boxId) {
  const { data, error } = await requireSupabase().rpc('my_signup_status', { p_box: boxId })
  if (error) throw error
  return data?.[0] || null
}

/* ---------- trava de plano ativo (migrations/20261129_trava_plano_ativo.sql) ---------- */

/**
 * Situação do plano de quem está logado (null se não houver cadastro):
 * { status: 'ativo'|'carencia'|'pendente'|'bloqueado'|'sem_plano', can_book, due_date, grace_left, plan_name, pending_amount }
 */
export async function fetchMyPlanStatus(boxId) {
  const { data, error } = await requireSupabase().rpc('my_plan_status', { p_box: boxId })
  if (error) throw error
  return data?.[0] || null
}

/* ---------- regras do plano (migrations/20261130_regras_plano.sql) ---------- */

/**
 * Aulas usadas por semana (segunda a domingo, fuso do box), a partir da atual:
 * [{ week_start: 'AAAA-MM-DD', week_end, used, weekly_limit }]  — weekly_limit null = livre.
 * Lista vazia para quem não é aluno.
 */
export async function fetchMyWeekUsage(boxId, weeks = 2) {
  const { data, error } = await requireSupabase().rpc('my_week_usage', { p_box: boxId, p_weeks: weeks })
  if (error) throw error
  return data || []
}

/* ---------- Horário Fixo (migrations/20261130_horario_fixo.sql) ---------- */

/** Horários fixos do aluno logado (ativos e desativados), com dados da turma. */
export async function fetchMyRecurring(boxId) {
  const { data, error } = await requireSupabase().rpc('my_recurring_bookings', { p_box: boxId })
  if (error) throw error
  return data || []
}

/** Fixa a turma desta aula toda semana; o banco já reserva as aulas dos próximos 7 dias. */
export function fixSlot({ sessionId }) {
  return call('app_fix_slot', { p_session: sessionId }, (d) => {
    if (d?.plan_status !== 'ativo') return 'Horário fixado. As reservas automáticas começam quando seu plano estiver em dia.'
    if (d?.booked > 0) return 'Horário fixado! Sua vaga já está reservada nesta semana 💪'
    return 'Horário fixado! Vamos reservar sua vaga toda semana.'
  })
}

/** Desativa um horário fixo (reservas já feitas continuam). */
export function unfixSlot({ recurringId }) {
  return call('app_unfix_slot', { p_recurring: recurringId }, 'Horário fixo desativado. Reservas já feitas continuam na Agenda.')
}

/** Feriados / datas especiais dos próximos dias (migrations/20261130_feriados_aulas_especiais.sql). */
export async function fetchSpecialDays(boxId, days = 7) {
  const { data, error } = await requireSupabase().rpc('get_special_days', { p_box: boxId, p_days: days })
  if (error) throw error
  return data || []
}
