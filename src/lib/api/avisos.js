/*
 * API do Mural do Box (tabela notices).
 * Regras: migrations/20261125_mural_avisos.sql, 20261127_avisos_moderacao.sql e
 * 20261128_comunidade_whatsapp.sql (aviso não usa mais a fila paga da Meta: quem publica
 * compartilha o texto pronto na Comunidade do WhatsApp do box — ver noticeShareText).
 * Leitura e escrita direto na tabela; o RLS decide quem vê e quem muda o quê, e o
 * trigger decide o status (publicado na hora ou pendente), a autoria e a fila do WhatsApp.
 * O app só manda título, texto, opções e, no caso do administrador, aprovar/recusar.
 *
 * Ações devolvem { ok: true, data, message } | { ok: false, code, message } (nunca lançam).
 */
import { requireSupabase } from '../supabase'
import { toFriendlyError } from './errors'

const COLS =
  'id, box_id, title, body, category, pinned, send_whatsapp, author_name, created_by, status, reviewed_at, rejection_reason, published_at, whatsapp_sent_at, whatsapp_recipients, created_at, updated_at'

/** Data que vale para o mural: quando entrou publicado (aprovado ontem = novo hoje). */
export const feedDate = (n) => n.published_at || n.created_at

/** Fixados primeiro, depois os mais novos. */
export const sortNotices = (list) =>
  [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(feedDate(b)).localeCompare(String(feedDate(a))))

/** `publishedOnly`: o mural do aluno (um coach logado na agenda não vê as próprias pendentes lá). */
export async function fetchNotices(boxId, { publishedOnly = false, limit = 150 } = {}) {
  let q = requireSupabase().from('notices').select(COLS).eq('box_id', boxId)
  if (publishedOnly) q = q.eq('status', 'published')
  const { data, error } = await q.order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data || []
}

async function run(query, message) {
  try {
    const { data, error } = await query
    if (error) return { ok: false, ...toFriendlyError(error) }
    if (Array.isArray(data) && data.length === 0) return { ok: false, code: 'AVISO_NAO_ENCONTRADO', message: 'Aviso não encontrado ou sem permissão. Atualize a lista.' }
    const row = Array.isArray(data) ? data[0] : data
    return { ok: true, data: row, message: typeof message === 'function' ? message(row) : message }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

const clean = (f) => ({
  title: String(f.title || '').trim(),
  body: String(f.body || '').trim() || null,
  category: f.category || 'geral',
  pinned: Boolean(f.pinned),
})

const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`

/** Mensagem do Toast conforme o que o banco fez com o aviso. */
function savedMessage(n, verb) {
  if (n.status === 'pending') return 'Enviado para aprovação. O aviso aparece para os alunos quando o administrador aprovar.'
  return n.pinned ? `Aviso ${verb} e fixado no topo do mural.` : `Aviso ${verb} no mural.`
}

export function createNotice(boxId, form) {
  return run(requireSupabase().from('notices').insert({ box_id: boxId, ...clean(form) }).select(COLS), (n) => savedMessage(n, 'publicado'))
}

/** `prev`: o aviso antes da edição. Coach que edita uma recusada reenvia para aprovação (o banco decide). */
export function updateNotice(prev, form) {
  return run(requireSupabase().from('notices').update(clean(form)).eq('id', prev.id).select(COLS), (n) =>
    n.status === 'pending' ? savedMessage(n) : prev.status !== 'published' && n.status === 'published' ? savedMessage(n, 'publicado') : savedMessage(n, 'atualizado'),
  )
}

export function setPinned(id, pinned) {
  return run(requireSupabase().from('notices').update({ pinned }).eq('id', id).select(COLS), pinned ? 'Aviso fixado no topo.' : 'Aviso desafixado.')
}

export function deleteNotice(id, { request = false } = {}) {
  return run(requireSupabase().from('notices').delete().eq('id', id).select('id'), request ? 'Solicitação excluída.' : 'Aviso excluído.')
}

/* ---------- moderação (só administrador; o RLS e o trigger garantem) ---------- */

/** Aprovar e publicar. `form` opcional: editar antes de aprovar, na mesma gravação. */
export function approveNotice(id, form) {
  const patch = { ...(form ? clean(form) : {}), status: 'published' }
  return run(requireSupabase().from('notices').update(patch).eq('id', id).select(COLS), (n) => savedMessage(n, 'aprovado e publicado'))
}

export function rejectNotice(id, reason) {
  return run(
    requireSupabase()
      .from('notices')
      .update({ status: 'rejected', rejection_reason: String(reason || '').trim() || null })
      .eq('id', id)
      .select(COLS),
    'Solicitação recusada. O coach vê o motivo em “Minhas solicitações”.',
  )
}

/* ---------- informações do formulário e permissões ---------- */

/** Se quem está logado publica direto, se é administrador e o link da Comunidade do box. */
export async function fetchNoticeSettings(boxId) {
  const { data, error } = await requireSupabase().rpc('notice_settings', { p_box: boxId })
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data?.[0] || { can_publish_direct: false, is_admin: false, whatsapp_community_url: null }
}

/** Link da Comunidade para o convite no mural do aluno (null se o box não tiver). */
export async function fetchCommunityUrl(boxId) {
  const { data, error } = await requireSupabase().rpc('box_community_url', { p_box: boxId })
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data || null
}

/** Administrador cola/edita o link (vazio apaga). */
export async function setCommunityUrl(boxId, url) {
  try {
    const { data, error } = await requireSupabase().rpc('admin_set_community_url', { p_box: boxId, p_url: url || null })
    if (error) return { ok: false, ...toFriendlyError(error) }
    return { ok: true, data, message: data ? 'Link da Comunidade salvo. Os alunos veem o convite no mural.' : 'Link da Comunidade removido.' }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}

/* ---------- compartilhar na Comunidade do WhatsApp (custo zero) ---------- */

const CAT_EMOJI = { geral: '📣', urgente: '🚨', evento: '🎉', horario: '⏰', feriado: '📅', aulao: '💪', desafio: '🔥' }

/** Endereço do mural do box (aba Avisos da agenda). */
export function muralUrl(slug) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
  return `${base}/clientes/${slug}/agenda?aba=avisos`
}

/** Texto pronto para o WhatsApp: emoji da categoria + *título* + corpo + link do mural. */
export function noticeShareText(n, { boxName, slug } = {}) {
  const lines = [`${CAT_EMOJI[n.category] || CAT_EMOJI.geral} *${String(n.title).trim()}*`]
  if (n.body) lines.push('', String(n.body).trim())
  lines.push('', `📌 Mural${boxName ? ` do ${boxName}` : ''}: ${muralUrl(slug)}`)
  return lines.join('\n')
}

/** Coaches do box com a permissão de publicar sem aprovação (só administrador). */
export async function fetchCoaches(boxId) {
  const { data, error } = await requireSupabase().rpc('admin_coaches', { p_box: boxId })
  if (error) throw Object.assign(new Error(error.message), toFriendlyError(error))
  return data || []
}

export async function setCoachPublish(personId, enabled, name) {
  try {
    const { error } = await requireSupabase().rpc('admin_set_coach_publish', { p_person: personId, p_enabled: enabled })
    if (error) return { ok: false, ...toFriendlyError(error) }
    const who = String(name || 'O coach').split(' ')[0]
    return { ok: true, message: enabled ? `${who} agora publica avisos sem aprovação.` : `Avisos de ${who} voltam a passar pela sua aprovação.` }
  } catch (err) {
    return { ok: false, ...toFriendlyError(err) }
  }
}
