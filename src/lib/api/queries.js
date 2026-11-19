/*
 * Leituras (busca inicial). Só SELECTs — nenhuma regra de negócio aqui.
 * O RLS decide o que cada um enxerga: o aluno lê só as próprias reservas,
 * coach/owner do box leem todas.
 */
import { requireSupabase } from '../supabase'

// O box roda em America/Sao_Paulo (sem horário de verão desde 2019 → UTC-3 fixo).
// Se um dia houver box em outro fuso, troque por boxes.timezone.
const BOX_UTC_OFFSET = '-03:00'
const BOX_TZ = 'America/Sao_Paulo'

/** 'AAAA-MM-DD' de hoje no fuso do box. */
export function todayInBox(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOX_TZ }).format(date)
}

/** Intervalo [início, fim) do dia no fuso do box, em ISO. */
export function dayRange(day) {
  const start = new Date(`${day}T00:00:00${BOX_UTC_OFFSET}`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

/** Pessoa do usuário logado neste box (ou null se não estiver logado / não for membro). */
export async function fetchMe(boxId) {
  const data = unwrap(await requireSupabase().rpc('my_person', { p_box: boxId }))
  // função SQL que retorna composto sem linha → objeto com campos nulos
  return data?.id ? data : null
}

/** Grade semanal fixa (turmas). */
export async function fetchSlots(boxId) {
  return unwrap(
    await requireSupabase()
      .from('schedule_slots')
      .select('id, weekday, start_time, duration_min, level, capacity, trial_quota, label, coach_id, sales_block')
      .eq('box_id', boxId)
      .eq('active', true)
      .order('weekday')
      .order('start_time'),
  )
}

/**
 * Aulas do dia com a turma embutida.
 * booked_count / waitlist_count são mantidos por trigger no banco
 * (supabase/migrations/20261118_session_counters.sql) — o front só exibe.
 */
export const SESSION_COLUMNS =
  'id, slot_id, box_id, starts_at, capacity_override, coach_override, cancelled, closed_at, booked_count, waitlist_count'

export async function fetchDaySessions(boxId, day) {
  const { start, end } = dayRange(day)
  return unwrap(
    await requireSupabase()
      .from('class_sessions')
      .select(`${SESSION_COLUMNS}, slot:schedule_slots(id, start_time, duration_min, level, capacity, label, coach_id)`)
      .eq('box_id', boxId)
      .gte('starts_at', start)
      .lt('starts_at', end)
      .order('starts_at'),
  )
}

const BOOKING_COLUMNS = 'id, session_id, person_id, type, status, source, checkin_method, checkin_at, hold_until, created_at'

/** Reservas do próprio aluno nas aulas informadas. */
export async function fetchMyBookings(personId, sessionIds) {
  if (!personId || !sessionIds.length) return []
  return unwrap(
    await requireSupabase().from('bookings').select(BOOKING_COLUMNS).eq('person_id', personId).in('session_id', sessionIds),
  )
}

/** Posições do aluno nas listas de espera do dia. */
export async function fetchMyWaitlist(personId, sessionIds) {
  if (!personId || !sessionIds.length) return []
  return unwrap(
    await requireSupabase()
      .from('waitlist')
      .select('session_id, person_id, position')
      .eq('person_id', personId)
      .in('session_id', sessionIds),
  )
}

/** Chamada completa (só coach/owner — o RLS devolve vazio para aluno). */
export async function fetchRoster(sessionIds) {
  if (!sessionIds.length) return []
  return unwrap(
    await requireSupabase()
      .from('bookings')
      .select(`${BOOKING_COLUMNS}, person:people(id, name, plan, role)`)
      .in('session_id', sessionIds)
      .in('status', ['reservado', 'presente', 'pre_reserva', 'falta']),
  )
}

/** Busca o nome de uma pessoa (usado quando chega reserva nova via Realtime na tela do coach). */
export async function fetchPersonLite(personId) {
  return unwrap(await requireSupabase().from('people').select('id, name, plan, role').eq('id', personId).maybeSingle())
}
