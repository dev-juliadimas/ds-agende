/*
 * API do Super Admin (/super-admin): clientes do DS Agende.
 * RPCs de supabase/migrations/20261130_super_admin.sql — permissão checada no banco
 * (profiles.is_super_admin). Ações devolvem { ok, data, message } | { ok: false, code, message }.
 */
import { requireSupabase } from '../supabase'
import { toFriendlyError } from './errors'

async function call(fn, params, successMessage) {
  try {
    const { data, error } = await requireSupabase().rpc(fn, params)
    if (error) return { ok: false, ...toFriendlyError(error) }
    return { ok: true, data, message: typeof successMessage === 'function' ? successMessage(data) : successMessage }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

export async function amISuperAdmin() {
  const { data, error } = await requireSupabase().rpc('is_super_admin')
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data === true
}

export async function listBoxes() {
  const { data, error } = await requireSupabase().rpc('sa_list_boxes')
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data || []
}

export function saveBox(b) {
  return call(
    'sa_upsert_box',
    {
      p_id: b.id || null,
      p_name: b.name,
      p_slug: b.slug,
      p_category: b.category,
      p_primary: b.brand_primary,
      p_secondary: b.brand_secondary,
      p_logo_light: b.logo_light_url,
      p_logo_dark: b.logo_dark_url,
      p_community: b.whatsapp_community_url,
    },
    b.id ? 'Cliente atualizado.' : 'Cliente cadastrado. 🎉',
  )
}

export function setBoxActive(boxId, active) {
  return call('sa_set_box_active', { p_box: boxId, p_active: active }, active ? 'Acesso liberado.' : 'Acesso suspenso.')
}
