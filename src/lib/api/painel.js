/*
 * API do Painel do administrador (/clientes/:slug/painel) e do formulário "Tenho interesse".
 * RPCs de supabase/migrations/20261123_painel_admin.sql — regras e permissões no banco.
 *
 * Ações devolvem { ok: true, data, message } | { ok: false, code, message } (nunca lançam).
 * Leituras lançam o erro (a tela mostra o estado de erro).
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

async function read(fn, params) {
  const { data, error } = await requireSupabase().rpc(fn, params)
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data
}

/* ---------- público ---------- */

/** Formulário "Tenho interesse" da página do box (sem login). */
export function submitLead({ boxId, name, phone, interest, message, consent }) {
  return call(
    'submit_lead',
    { p_box: boxId, p_name: name, p_phone: phone, p_interest: interest || null, p_message: message || null, p_consent: consent },
    'Recebemos seu contato! O box vai falar com você pelo WhatsApp.',
  )
}

/* ---------- painel (só owner) ---------- */

export const isOwner = (boxId) => read('is_owner', { p_box: boxId })
export const fetchOverview = (boxId) => read('admin_overview', { p_box: boxId })
export const fetchMembers = async (boxId) => (await read('admin_members', { p_box: boxId })) || []
export const fetchLeads = async (boxId) => (await read('admin_leads', { p_box: boxId })) || []

/** Ficha de saúde (PAR-Q). RLS: só a equipe do box lê. null se a pessoa não tem ficha. */
export async function fetchHealthForm(personId) {
  const { data, error } = await requireSupabase().from('health_forms').select('*').eq('person_id', personId).maybeSingle()
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data
}

const LEAD_MSG = {
  contatado: 'Marcado como contatado.',
  convertido: 'Marcado como convertido. 🎉',
  descartado: 'Interessado arquivado.',
  novo: 'Voltou para novos.',
}

export function updateLead({ leadId, status, notes }) {
  return call('admin_update_lead', { p_lead: leadId, p_status: status, p_notes: notes || null }, LEAD_MSG[status])
}

/** Baixa manual de cobrança pendente (dinheiro / maquininha / pix recebido no balcão). */
export function confirmPayment({ paymentId, method }) {
  return call('confirm_payment', { p_payment: paymentId, p_method: method }, 'Pagamento confirmado. Acesso liberado.')
}

/** Link do WhatsApp com mensagem pronta. */
export function waLink(phone, text) {
  const d = String(phone || '').replace(/\D/g, '')
  const num = d.length === 10 || d.length === 11 ? `55${d}` : d
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/* ---------- coach e owner (migrations/20261124_painel_coach.sql) ---------- */

/** Aulas dos próximos dias com a lista de quem vai. all=false: só as turmas de quem está logado. */
export const fetchStaffSessions = async (boxId, { days = 7, all = false } = {}) =>
  (await read('staff_sessions', { p_box: boxId, p_days: days, p_all: all })) || []

/* ---------- coach por aula e trocas (migrations/20261207_coach_por_aula_e_trocas.sql) ---------- */

/** Coaches e administradores do box (quem pode dar aula). */
export const fetchStaffCoaches = async (boxId) => (await read('staff_coaches', { p_box: boxId })) || []

/** Trocas pendentes + últimos 30 dias (coach: as dele; administrador: todas). */
export const fetchCoachSwaps = async (boxId) => (await read('my_coach_swaps', { p_box: boxId })) || []

/** Administrador: coach fixo da turma (toda semana). */
export function setSlotCoach({ slotId, coachId }) {
  return call('admin_set_slot_coach', { p_slot: slotId, p_coach: coachId }, 'Coach fixo da turma atualizado.')
}

/** Administrador: coach só desta data (null = volta para o coach fixo). */
export function setSessionCoach({ sessionId, coachId }) {
  return call('admin_set_session_coach', { p_session: sessionId, p_coach: coachId }, 'Coach desta aula atualizado.')
}

/** Coach pede para outro coach assumir a aula ('aula' = só esta data, 'turma' = toda semana). */
export function requestSwap({ sessionId, toCoachId, scope, note }) {
  return call(
    'coach_request_swap',
    { p_session: sessionId, p_to: toCoachId, p_scope: scope, p_note: note || null },
    'Pedido enviado. A aula muda de coach quando ele aceitar.',
  )
}

export function respondSwap({ swapId, accept }) {
  return call('coach_respond_swap', { p_swap: swapId, p_accept: accept }, accept ? 'Troca aceita. A aula agora é sua.' : 'Troca recusada.')
}

export function cancelSwap({ swapId }) {
  return call('coach_cancel_swap', { p_swap: swapId }, 'Pedido de troca cancelado.')
}

/** Pessoas do box sem telefone/financeiro (aniversariantes e experimentais do coach). */
export const fetchStaffPeople = async (boxId) => (await read('staff_people', { p_box: boxId })) || []

/* ---------- feriados e aulas especiais (migrations/20261130_feriados_aulas_especiais.sql) ---------- */

/** Datas marcadas (feriado / especial) e dias com aula avulsa, de hoje em diante. */
export const fetchSpecialDays = async (boxId, days = 90) => (await read('admin_special_days', { p_box: boxId, p_days: days })) || []

/** Modalidades do box (RLS: membros leem). */
export async function fetchModalities(boxId) {
  const { data, error } = await requireSupabase()
    .from('modalities')
    .select('id, code, name, color')
    .eq('box_id', boxId)
    .eq('active', true)
    .order('display_order')
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data || []
}

/** Marca a data. kind 'feriado' cancela as aulas da grade do dia; 'especial' só destaca. */
export function setSpecialDay({ boxId, day, kind, title, note }) {
  return call('admin_set_special_day', { p_box: boxId, p_day: day, p_kind: kind, p_title: title, p_note: note || null }, (r) => {
    if (kind !== 'feriado') return r?.reopened_sessions ? `Data salva. ${r.reopened_sessions} aula(s) da grade reabertas.` : 'Data especial salva.'
    const s = r?.cancelled_sessions || 0
    const b = r?.cancelled_bookings || 0
    return `Feriado salvo. ${s} aula(s) da grade cancelada(s)${b ? ` e ${b} reserva(s) desfeita(s)` : ''}.`
  })
}

export function removeSpecialDay({ boxId, day }) {
  return call('admin_remove_special_day', { p_box: boxId, p_day: day }, (r) =>
    r?.reopened_sessions ? `Marcação removida. ${r.reopened_sessions} aula(s) da grade voltaram.` : 'Marcação removida.',
  )
}

/** Aula avulsa numa data (não entra na grade fixa). time = 'HH:MM'. */
export function createSpecialSession({ boxId, day, time, label, duration, capacity, modalityId, coachId, level }) {
  return call(
    'admin_create_special_session',
    {
      p_box: boxId,
      p_day: day,
      p_time: time,
      p_label: label,
      p_duration: Number(duration),
      p_capacity: Number(capacity),
      p_modality: modalityId || null,
      p_coach: coachId || null,
      p_level: level || 'misto',
    },
    'Aula especial criada. Já aparece na agenda dos alunos.',
  )
}

export function cancelSpecialSession({ sessionId, reason }) {
  return call('admin_cancel_special_session', { p_session: sessionId, p_reason: reason || null }, (r) =>
    r?.result === 'apagada' ? 'Aula especial removida.' : `Aula especial cancelada${r?.cancelled_bookings ? ` (${r.cancelled_bookings} reserva(s) desfeita(s))` : ''}.`,
  )
}
