/*
 * Treino do Dia (WOD) por data e modalidade — tabela daily_wods
 * (supabase/migrations/20261201_treino_do_dia.sql). Permissões no RLS:
 * membros do box leem; coach/owner gravam e apagam.
 *
 * Leituras lançam o erro. Ações devolvem { ok, data, message } | { ok: false, code, message }.
 */
import { requireSupabase } from '../supabase'
import { toFriendlyError } from './errors'

const fail = (error) => Object.assign(new Error(error.message), toFriendlyError(error))

// erros do Postgres que, nesta tabela, pedem um texto próprio
const WOD_ERRORS = {
  23514: 'Confira os campos: título até 80 letras e treino até 4000.',
  23503: 'Modalidade não encontrada neste box. Atualize a página.',
}
const friendly = (error) => (WOD_ERRORS[error?.code] ? { code: String(error.code), message: WOD_ERRORS[error.code] } : toFriendlyError(error))

/** Modalidades ativas do box (para o seletor do coach). */
export async function fetchModalities(boxId) {
  const { data, error } = await requireSupabase()
    .from('modalities')
    .select('code, name, color')
    .eq('box_id', boxId)
    .eq('active', true)
    .order('display_order')
  if (error) throw fail(error)
  return data || []
}

/** Treinos entre duas datas 'YYYY-MM-DD' (inclusive). */
export async function fetchWods(boxId, from, to) {
  const { data, error } = await requireSupabase()
    .from('daily_wods')
    .select('id, wod_date, modality, title, description, updated_at')
    .eq('box_id', boxId)
    .gte('wod_date', from)
    .lte('wod_date', to)
  if (error) throw fail(error)
  return data || []
}

/** Lança ou atualiza o treino daquela data + modalidade. */
export async function saveWod({ boxId, date, modality, title, description }) {
  try {
    const { data, error } = await requireSupabase()
      .from('daily_wods')
      .upsert(
        { box_id: boxId, wod_date: date, modality, title: title.trim(), description: description?.trim() || null },
        { onConflict: 'box_id,wod_date,modality' },
      )
      .select()
      .single()
    if (error) return { ok: false, ...friendly(error) }
    return { ok: true, data, message: 'Treino do dia publicado. 💪' }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

export async function deleteWod(id) {
  try {
    const { error } = await requireSupabase().from('daily_wods').delete().eq('id', id)
    if (error) return { ok: false, ...toFriendlyError(error) }
    return { ok: true, message: 'Treino removido.' }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

/** Mapa "data|modalidade" → treino, para achar o WOD de cada aula. */
export const wodKey = (date, modality) => `${date}|${modality}`
export function indexWods(rows) {
  const m = {}
  for (const w of rows) m[wodKey(w.wod_date, w.modality)] = w
  return m
}
