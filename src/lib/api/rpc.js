/*
 * Ações principais — cada uma é só uma chamada de RPC.
 * Toda regra (capacidade, limite do plano, prazo, overbooking com FOR UPDATE,
 * promoção da lista de espera) roda no banco. Aqui só chamamos e traduzimos.
 *
 * Todas as funções devolvem o mesmo formato, pronto para o Toast:
 *   { ok: true,  data, message }               → toast(message, 'ok')
 *   { ok: false, code, message }               → toast(message, 'err')
 * Elas NUNCA lançam exceção, então a tela não precisa de try/catch.
 */
import { requireSupabase } from '../supabase'
import { toFriendlyError } from './errors'

/** Executa uma RPC com tratamento de erro uniforme. */
async function callRpc(fn, params, successMessage) {
  try {
    const { data, error } = await requireSupabase().rpc(fn, params)
    if (error) return { ok: false, ...toFriendlyError(error) }
    const message = typeof successMessage === 'function' ? successMessage(data) : successMessage
    return { ok: true, data, message }
  } catch (err) {
    // erro de rede ou cliente não configurado
    return { ok: false, ...toFriendlyError(err) }
  }
}

/**
 * Reservar aula.
 * @param {object} p
 * @param {string} p.sessionId  class_sessions.id
 * @param {string} p.personId   people.id (do usuário logado — ver my_person)
 * @param {'avulso'|'recorrente'|'experimental'|'dropin'|'extra'} [p.type]
 * @param {'web'|'whatsapp'|'coach'|'sistema'} [p.source]
 * @param {boolean} [p.hold]    true = pré-reserva aguardando Pix/Cartão (expira em boxes.hold_minutes)
 * @returns data = linha de `bookings` criada
 */
export function bookClass({ sessionId, personId, type = 'avulso', source = 'web', hold = false }) {
  return callRpc(
    'book_class',
    { p_session: sessionId, p_person: personId, p_type: type, p_source: source, p_hold: hold },
    (b) => (b?.status === 'pre_reserva' ? 'Vaga segurada! Conclua o pagamento para confirmar.' : 'Vaga garantida! 💪'),
  )
}

/**
 * Cancelar reserva. Se cancelado no prazo, o banco já promove o 1º da lista de espera.
 * @param {boolean} [force] só para o coach: ignora o prazo mínimo (min_cancel_minutes)
 */
export function cancelBooking({ bookingId, source = 'web', force = false }) {
  return callRpc(
    'cancel_booking',
    { p_booking: bookingId, p_source: source, p_force: force },
    'Reserva cancelada. Sua vaga foi liberada para outro aluno.',
  )
}

/**
 * Check-in lendo o QR dinâmico da TV.
 * O QR deve codificar `{ sessionId, token }` (ou uma URL com ?s=...&t=...) — use parseQrPayload.
 */
export function checkinQr({ sessionId, token, personId }) {
  return callRpc('checkin_qr', { p_session: sessionId, p_token: token, p_person: personId }, 'Presença confirmada! Bom treino 🔥')
}

/**
 * Encerrar aula (coach). Reservas sem check-in viram 'falta';
 * o trigger award_badges cuida dos selos de quem esteve presente.
 */
export function closeSession({ sessionId }) {
  return callRpc('close_session', { p_session: sessionId }, 'Aula encerrada. Presenças e faltas registradas.')
}

/**
 * Lista de espera.
 * O schema.sql ainda não tem RPC para isso, então gravamos direto na tabela `waitlist`
 * (a posição é um serial). Quando existir `join_waitlist`, troque por callRpc.
 */
export async function joinWaitlist({ sessionId, personId }) {
  try {
    const { error } = await requireSupabase().from('waitlist').insert({ session_id: sessionId, person_id: personId })
    if (error) {
      if (error.code === '23505') return { ok: false, code: 'JA_NA_FILA', message: 'Você já está na lista de espera.' }
      return { ok: false, ...toFriendlyError(error) }
    }
    return { ok: true, message: 'Você entrou na lista de espera. Avisamos se abrir vaga!' }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

export async function leaveWaitlist({ sessionId, personId }) {
  try {
    const { error } = await requireSupabase().from('waitlist').delete().match({ session_id: sessionId, person_id: personId })
    if (error) return { ok: false, ...toFriendlyError(error) }
    return { ok: true, message: 'Você saiu da lista de espera.' }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

/** Lê o conteúdo do QR da TV: JSON `{"s":"uuid","t":"token"}` ou URL `...?s=uuid&t=token`. */
export function parseQrPayload(text) {
  try {
    const j = JSON.parse(text)
    if (j.s && j.t) return { sessionId: j.s, token: j.t }
  } catch {
    /* não é JSON, tenta URL */
  }
  try {
    const u = new URL(text)
    const s = u.searchParams.get('s')
    const t = u.searchParams.get('t')
    if (s && t) return { sessionId: s, token: t }
  } catch {
    /* não é URL */
  }
  return null
}
