/*
 * Camada de dados única da demo.
 * Em produção cada função abaixo vira uma RPC/Edge Function no Supabase
 * (ver supabase/schema.sql). A Web e o Bot de WhatsApp chamam AS MESMAS regras,
 * e o Supabase Realtime propaga as mudanças para todas as telas abertas.
 * Aqui simulamos isso com um store em memória + useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react'
import { BADGES, BOX, CLASS_DURATION, DAYS, DISPATCHES, DROPIN_PRICE, HOLD_MINUTES, META_PRICE, ME_ID, PAY_METHODS, PIX_EXTRA_PRICE, PLANS, TRIAL_LEVELS, brl, dayByKey, dayIndex, fmtDate, fromMin, toMin } from './constants'
import { buildBookings, buildHistory, buildNotices, buildPeople, buildSlots, buildStories, seedBirthdays, TRIAL_FUNNEL_HISTORY, WODS } from './seed'

let uid = 1000
const nid = (p) => `${p}${++uid}`
const clock = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function initialState() {
  const slots = buildSlots()
  const people = buildPeople()
  const bookings = buildBookings(slots, people)
  seedBirthdays(people, bookings)
  return {
    now: { day: 'qui', min: toMin('05:50') },
    gpsInside: true,
    realGps: null, // { lat, lng, accuracy } quando o aluno usa o GPS real do aparelho
    // salesMode: 'livre' = vende em qualquer horário com vaga | 'auto' = só vende abaixo de salesMaxPct de ocupação
    // bookAheadDays: até quantos dias à frente o aluno pode reservar (0 = só hoje) → boxes.book_ahead_days
    // minCancelHours (0,5 = 30 min) → boxes.min_cancel_minutes no Supabase (em minutos)
    // graceDays: dias de tolerância após o vencimento → boxes.grace_days
    // dispatches: liga/desliga cada disparo ativo do bot (custo Meta) → boxes.dispatch_*
    settings: {
      minCancelHours: 2,
      bookAheadDays: 1,
      reminderTime: '20:00',
      salesMode: 'auto',
      salesMaxPct: 70,
      graceDays: 3,
      prices: { '2x': PLANS['2x'].price, '3x': PLANS['3x'].price, ilimitado: PLANS.ilimitado.price, dropin: DROPIN_PRICE, extra: PIX_EXTRA_PRICE },
      dispatches: { reminder: true, waitlist: true, billing: true, urgent: true, badge: true, rescue: false },
    },
    slots,
    people,
    bookings,
    waitlist: {},
    recurrences: [],
    notices: buildNotices(),
    stories: buildStories(),
    storiesSeen: {},
    history: buildHistory(slots),
    trialHistory: TRIAL_FUNNEL_HISTORY,
    wods: WODS,
    qr: null,
    events: [],
    toasts: [],
    celebration: null,
    rescueSent: {},
    payments: [
      { id: 'pay_old1', personId: ME_ID, kind: 'mensalidade', plan: '3x', amount: PLANS['3x'].price, method: 'pix', status: 'pago', createdAt: '11/10 07:12', paidAt: '11/10 07:12' },
    ],
    metaLog: [], // disparos ativos enviados nesta demo: { kind, cost, free }
    flash: {},
    chats: {
      me: { messages: [], ctx: { step: 'idle' }, personId: ME_ID, name: 'Marina Costa', phone: '(11) 98888-1234' },
      visitor: { messages: [], ctx: { step: 'idle' }, personId: null, name: 'Novo contato', phone: '(11) 95555-0101' },
    },
  }
}

let state = initialState()
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
export const getState = () => state
function set(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  emit()
}
export function useDB() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), getState)
}

/* ---------------- utilitários e regras ---------------- */
export const slotById = (s, id) => s.slots.find((x) => x.id === id)
export const effectiveCap = (slot) => slot.override ?? slot.capacity
// 'pre_reserva' segura a vaga por 15 min enquanto o Pix/Cartão não é confirmado
export const active = (b) => b.status === 'reservado' || b.status === 'presente' || b.status === 'pre_reserva'

export function slotCounts(s, slotId) {
  const slot = slotById(s, slotId)
  const list = s.bookings.filter((b) => b.slotId === slotId && active(b))
  const trials = list.filter((b) => b.type === 'experimental').length
  const cap = effectiveCap(slot)
  return { taken: list.length, trials, cap, free: Math.max(0, cap - list.length), waitlist: (s.waitlist[slotId] || []).length }
}

/*
 * Venda avulsa (aula experimental, drop-in e treino extra via Pix).
 * O box pode vender só nos horários mais vazios: acima do limite de ocupação
 * a aula aparece bloqueada para venda. Alunos matriculados continuam reservando.
 * Cada horário aceita exceção manual: 'auto' (segue a regra), 'open' (sempre vende), 'blocked' (nunca vende).
 */
export const SALE_TYPES = ['experimental', 'dropin', 'extra']
export function salesStatus(s, slot) {
  const mode = slot.salesBlock || 'auto'
  if (mode === 'blocked') return { open: false, reason: 'Horário bloqueado pelo box para venda avulsa.', manual: true }
  if (mode === 'open') return { open: true, manual: true }
  if (s.settings.salesMode === 'auto') {
    const c = slotCounts(s, slot.id)
    const pct = Math.round((c.taken / c.cap) * 100)
    if (pct >= s.settings.salesMaxPct)
      return { open: false, pct, reason: `Horário com alta ocupação (${pct}%). Venda avulsa só abaixo de ${s.settings.salesMaxPct}%.` }
    return { open: true, pct }
  }
  return { open: true }
}

export function minutesUntil(s, slot) {
  return (dayIndex(slot.day) - dayIndex(s.now.day)) * 1440 + toMin(slot.time) - s.now.min
}

export function slotStatus(s, slot) {
  if (slot.closed) return 'closed'
  const m = minutesUntil(s, slot)
  if (m <= -CLASS_DURATION) return 'past'
  if (m <= 0) return 'live'
  return 'open'
}

export function weeklyCount(s, pid) {
  return s.bookings.filter((b) => b.personId === pid && active(b) && b.type !== 'experimental').length
}

export function myBookings(s, pid = ME_ID) {
  return s.bookings
    .filter((b) => b.personId === pid && active(b))
    .map((b) => ({ ...b, slot: slotById(s, b.slotId) }))
    .sort((a, b) => dayIndex(a.slot.day) - dayIndex(b.slot.day) || toMin(a.slot.time) - toMin(b.slot.time))
}

// "0,5" -> "30 min", "2" -> "2h"
export const fmtHours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h}h`)

/* Janela de reserva: o box define até quantos dias à frente a agenda fica aberta */
export function bookingWindow(s, slot) {
  const ahead = dayIndex(slot.day) - dayIndex(s.now.day)
  const max = s.settings.bookAheadDays
  if (ahead <= max) return { open: true }
  const opensOn = DAYS[dayIndex(slot.day) - max]
  const days = ahead - max
  return {
    open: false,
    opensOn,
    msg: `A agenda de ${dayByKey(slot.day).label} abre ${days === 1 ? 'amanhã' : `em ${days} dias`} (${opensOn.label}). O box libera reservas com até ${max === 0 ? 'o próprio dia' : max === 1 ? '1 dia' : `${max} dias`} de antecedência.`,
  }
}

export function canBook(s, slotId, pid, type = 'avulso') {
  const slot = slotById(s, slotId)
  if (!slot) return { ok: false, code: 'invalid', msg: 'Horário inválido.' }
  const st = slotStatus(s, slot)
  if (st !== 'open' && !(st === 'live' && minutesUntil(s, slot) > -BOX.checkinWindowMin))
    return { ok: false, code: 'past', msg: 'Esta aula já começou ou foi encerrada.' }
  // a reserva fixa é gerada pelo sistema e não depende da janela
  if (type !== 'recorrente') {
    const w = bookingWindow(s, slot)
    if (!w.open) return { ok: false, code: 'window', msg: w.msg }
  }
  if (pid && s.bookings.some((b) => b.slotId === slotId && b.personId === pid && active(b)))
    return { ok: false, code: 'dup', msg: 'Você já está inscrito(a) neste horário.' }
  const c = slotCounts(s, slotId)
  if (SALE_TYPES.includes(type)) {
    const sale = salesStatus(s, slot)
    if (!sale.open) return { ok: false, code: 'sales', msg: sale.reason }
  }
  if (type === 'experimental') {
    if (!TRIAL_LEVELS.includes(slot.level)) return { ok: false, code: 'level', msg: 'Aula experimental só em horários Iniciante ou Todos os Níveis.' }
    if (c.trials >= slot.trialQuota) return { ok: false, code: 'quota', msg: `Cota de experimentais deste horário esgotada (${slot.trialQuota}).` }
  }
  if (c.free <= 0) return { ok: false, code: 'full', msg: 'Turma lotada. Entre na lista de espera.' }
  const p = s.people[pid]
  if (p && p.role === 'aluno' && type !== 'dropin') {
    const bs = billingStatus(s, pid)
    if (bs.status === 'bloqueado')
      return { ok: false, code: 'blocked', msg: `Acesso bloqueado: a mensalidade venceu em ${fmtDate(bs.due)} e a carência de ${s.settings.graceDays} dias acabou. Regularize em Planos para voltar a reservar.` }
  }
  if (p && p.role === 'aluno' && type !== 'experimental' && type !== 'extra' && p.plan) {
    const limit = PLANS[p.plan].limit + (p.extraCredits || 0)
    if (weeklyCount(s, pid) >= limit)
      return { ok: false, code: 'plan', msg: `Limite do plano ${PLANS[p.plan].label} atingido nesta semana.` }
  }
  return { ok: true }
}

function slotLabel(slot) {
  return `${dayByKey(slot.day).label} ${slot.time}`
}

/* ---------------- efeitos de UI compartilhados ---------------- */
export function toast(msg, kind = 'ok') {
  const id = nid('t')
  set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600)
}
function log(source, text) {
  set((s) => ({ events: [{ id: nid('e'), ts: clock(), source, text }, ...s.events].slice(0, 40) }))
}
function flashSlot(slotId) {
  const k = nid('f')
  set((s) => ({ flash: { ...s.flash, [slotId]: k } }))
}
export function botSay(chat, text, buttons) {
  set((s) => ({
    chats: { ...s.chats, [chat]: { ...s.chats[chat], messages: [...s.chats[chat].messages, { id: nid('m'), from: 'bot', text, buttons, time: clock() }] } },
  }))
}
export function userSay(chat, text) {
  set((s) => ({
    chats: { ...s.chats, [chat]: { ...s.chats[chat], messages: [...s.chats[chat].messages, { id: nid('m'), from: 'user', text, time: clock() }] } },
  }))
}
export function setChatCtx(chat, ctx) {
  set((s) => ({ chats: { ...s.chats, [chat]: { ...s.chats[chat], ctx } } }))
}
export function setChatPerson(chat, personId, name) {
  set((s) => ({ chats: { ...s.chats, [chat]: { ...s.chats[chat], personId, name: name ?? s.chats[chat].name } } }))
}

/* ---------------- ações (equivalentes às RPCs do Supabase) ---------------- */
export function book({ slotId, personId, type = 'avulso', source = 'web', extra = {} }) {
  const res = canBook(state, slotId, personId, type)
  if (!res.ok) return res
  const b = { id: nid('b'), slotId, personId, type, status: 'reservado', source, checkin: null, confirmed: false, ...extra }
  set((s) => ({
    bookings: [...s.bookings, b],
    waitlist: { ...s.waitlist, [slotId]: (s.waitlist[slotId] || []).filter((p) => p !== personId) },
  }))
  const slot = slotById(state, slotId)
  log(source, b.status === 'pre_reserva' ? `${state.people[personId].name.split(' ')[0]} pré-reservou ${slotLabel(slot)} por ${HOLD_MINUTES} min (aguardando pagamento)` : `${state.people[personId].name.split(' ')[0]} reservou ${slotLabel(slot)} (${type})`)
  flashSlot(slotId)
  return { ok: true, booking: b }
}

export function joinWaitlist(slotId, personId, source = 'web') {
  const wl = state.waitlist[slotId] || []
  if (billingStatus(state, personId).status === 'bloqueado') return { ok: false, msg: 'Acesso bloqueado por mensalidade em atraso. Regularize em Planos.' }
  if (wl.includes(personId)) return { ok: false, msg: 'Você já está na lista de espera.' }
  set((s) => ({ waitlist: { ...s.waitlist, [slotId]: [...wl, personId] } }))
  log(source, `${state.people[personId].name.split(' ')[0]} entrou na lista de espera de ${slotLabel(slotById(state, slotId))}`)
  return { ok: true, position: wl.length + 1 }
}

export function leaveWaitlist(slotId, personId) {
  set((s) => ({ waitlist: { ...s.waitlist, [slotId]: (s.waitlist[slotId] || []).filter((p) => p !== personId) } }))
}

export function canCancel(s, booking) {
  const slot = slotById(s, booking.slotId)
  const m = minutesUntil(s, slot)
  const min = s.settings.minCancelHours * 60
  return { ok: m >= min, minutesLeft: m, msg: m >= min ? '' : `Cancelamento/troca permitido até ${fmtHours(s.settings.minCancelHours)} antes da aula.` }
}

export function cancel(bookingId, source = 'web', { force = false, reason } = {}) {
  const b = state.bookings.find((x) => x.id === bookingId)
  if (!b) return { ok: false, msg: 'Reserva não encontrada.' }
  const rule = canCancel(state, b)
  if (!rule.ok && !force) return { ok: false, msg: rule.msg }
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'cancelado', cancelledBy: source, cancelReason: reason } : x)) }))
  const slot = slotById(state, b.slotId)
  log(source, reason === 'inadimplencia' ? `Reserva de ${state.people[b.personId].name.split(' ')[0]} em ${slotLabel(slot)} suspensa por inadimplência` : `${state.people[b.personId].name.split(' ')[0]} liberou a vaga de ${slotLabel(slot)}`)
  flashSlot(b.slotId)
  promoteWaitlist(b.slotId)
  return { ok: true }
}

function promoteWaitlist(slotId) {
  const wl = state.waitlist[slotId] || []
  if (!wl.length) return
  const next = wl[0]
  const res = book({ slotId, personId: next, type: 'avulso', source: 'sistema' })
  if (res.ok) {
    const slot = slotById(state, slotId)
    log('sistema', `Vaga repassada automaticamente para ${state.people[next].name.split(' ')[0]} (lista de espera)`)
    if (next === ME_ID) toast(`🎉 Vaga liberada! Você saiu da lista de espera: ${slotLabel(slot)}`)
    dispatch('waitlist', next, `🎉 *Vaga liberada!*\nVocê era o 1º da lista de espera e já está confirmada em *${slotLabel(slot)}* com ${slot.coach}.\n\nNão pode ir? Libere a vaga para o próximo.`, [
      { label: '👍 Estarei lá', value: `confirm:${res.booking.id}` },
      { label: '❌ Liberar vaga', value: `release:${res.booking.id}` },
    ])
  } else {
    // pula quem não pode mais (ex.: limite do plano)
    set((s) => ({ waitlist: { ...s.waitlist, [slotId]: wl.slice(1) } }))
    promoteWaitlist(slotId)
  }
}

export function swap(bookingId, newSlotId, source = 'web') {
  const b = state.bookings.find((x) => x.id === bookingId)
  const rule = canCancel(state, b)
  if (!rule.ok) return { ok: false, msg: rule.msg }
  // valida o novo horário antes de liberar o antigo (operação atômica na RPC)
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'swapping' } : x)) }))
  const res = canBook(state, newSlotId, b.personId, b.type)
  if (!res.ok) {
    set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'reservado' } : x)) }))
    return res
  }
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'cancelado', cancelledBy: source, cancelReason: 'troca' } : x)) }))
  const r2 = book({ slotId: newSlotId, personId: b.personId, type: b.type, source })
  promoteWaitlist(b.slotId)
  flashSlot(b.slotId)
  return r2
}

export function setRecurrence(personId, days, time, source = 'web') {
  const rec = { id: nid('r'), personId, days, time, source }
  set((s) => ({ recurrences: [...s.recurrences.filter((r) => r.personId !== personId), rec] }))
  const created = []
  const failed = []
  for (const d of days) {
    const slot = state.slots.find((x) => x.day === d && x.time === time)
    if (!slot) continue
    if (state.bookings.some((b) => b.slotId === slot.id && b.personId === personId && active(b))) continue
    if (slotStatus(state, slot) !== 'open') continue
    const r = book({ slotId: slot.id, personId, type: 'recorrente', source })
    r.ok ? created.push(slot) : failed.push({ slot, msg: r.msg })
  }
  log(source, `${state.people[personId].name.split(' ')[0]} ativou reserva fixa: ${days.map((d) => dayByKey(d).short).join('/')} às ${time}`)
  return { ok: true, created, failed, rec }
}

export function removeRecurrence(personId) {
  set((s) => ({ recurrences: s.recurrences.filter((r) => r.personId !== personId) }))
  toast('Reserva fixa desativada. As reservas desta semana foram mantidas.')
}

function newPerson(data) {
  const id = nid('v')
  const p = { id, total: 0, badges: [], plan: null, ...data }
  set((s) => ({ people: { ...s.people, [id]: p } }))
  return p
}

export function createTrial({ name, phone, slotId, companion, parq, referrerId = null, source = 'web' }) {
  const slot = slotById(state, slotId)
  const c = slotCounts(state, slotId)
  const need = companion ? 2 : 1
  const sale = salesStatus(state, slot)
  if (!sale.open) return { ok: false, msg: sale.reason }
  if (!TRIAL_LEVELS.includes(slot.level)) return { ok: false, msg: 'Escolha um horário Iniciante ou Todos os Níveis.' }
  if (c.trials + need > slot.trialQuota) return { ok: false, msg: `Restam ${Math.max(0, slot.trialQuota - c.trials)} vaga(s) experimental(is) neste horário.` }
  if (c.free < need) return { ok: false, msg: 'Não há vagas suficientes neste horário.' }
  const p = newPerson({ name, phone, role: 'visitante', parq, referrerId })
  const r1 = book({ slotId, personId: p.id, type: 'experimental', source, extra: { referrerId } })
  let comp = null
  if (companion) {
    comp = newPerson({ name: companion, phone, role: 'visitante', parq: { injuries: 'Não informado — perguntar na chegada', experience: `Acompanhante de ${name.split(' ')[0]}` }, companionOf: p.id, referrerId: p.id })
    book({ slotId, personId: comp.id, type: 'experimental', source, extra: { companionOf: p.id } })
  }
  set((s) => ({ trialHistory: [...s.trialHistory, { date: dayByKey(slot.day).date, scheduled: need, attended: 0, converted: 0, live: true }] }))
  return { ok: true, person: p, companion: comp, booking: r1.booking }
}

export function createDropin({ name, phone, fromBox, experience, slotId, method = 'recepcao', source = 'web' }) {
  const res = canBook(state, slotId, null, 'dropin')
  if (!res.ok) return res
  const p = newPerson({ name, phone, role: 'dropin', parq: { injuries: '—', experience: `Drop-in • ${experience} de CrossFit • ${fromBox || 'box não informado'}` } })
  return { ...startCheckout({ kind: 'dropin', personId: p.id, slotId, method, source }), person: p }
}

/* ---------------- presença, selos e encerramento ---------------- */
function evalBadges(p) {
  const metrics = { total: p.total, early: p.early, week: p.week, referrals: p.referrals || 0 }
  return BADGES.filter((b) => !p.badges.includes(b.id) && metrics[b.metric] >= b.goal).map((b) => b.id)
}

function awardFor(pid, mutate) {
  const p = { ...state.people[pid] }
  mutate(p)
  const newOnes = evalBadges(p)
  p.badges = [...p.badges, ...newOnes]
  set((s) => ({ people: { ...s.people, [pid]: p } }))
  if (pid === ME_ID && newOnes.length) {
    set({ celebration: newOnes[0] })
    for (const id of newOnes) {
      const bd = BADGES.find((b) => b.id === id)
      dispatch('badge', ME_ID, `${bd.emoji} *Novo selo desbloqueado: ${bd.name}!*\n${bd.desc}\n\nCompartilhe sua conquista nos Stories e marque @icaracross 💪`)
      log('sistema', `Marina desbloqueou o selo ${bd.emoji} ${bd.name}`)
    }
  }
  return newOnes
}

export function checkin(bookingId, method = 'manual') {
  const b = state.bookings.find((x) => x.id === bookingId)
  if (!b || b.status === 'presente') return { ok: false }
  const slot = slotById(state, b.slotId)
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'presente', checkin: { method, at: clock() } } : x)) }))
  const p = state.people[b.personId]
  log(method === 'manual' ? 'coach' : 'web', `Presença confirmada: ${p.name.split(' ')[0]} em ${slotLabel(slot)} (${method === 'qr' ? 'QR Code' : method === 'gps' ? 'GPS' : 'manual'})`)
  awardFor(b.personId, (x) => {
    x.total = (x.total || 0) + 1
    x.monthCount = (x.monthCount || 0) + 1
    x.streak = (x.streak || 0) + 1
    x.lastVisitDays = 0
    x.consecutiveNoShows = 0
    if (slot.time === '06:00') x.early = (x.early || 0) + 1
    x.week = (x.week || 0) + 1
  })
  // Quem indicou um amigo para experimental ganha o selo "Treino em Dupla" quando o amigo comparece
  const ref = b.referrerId || p.referrerId
  if (b.type === 'experimental' && ref && state.people[ref]?.role === 'aluno') {
    awardFor(ref, (x) => (x.referrals = (x.referrals || 0) + 1))
  }
  if (b.type === 'experimental') {
    set((s) => ({ trialHistory: [...s.trialHistory, { date: dayByKey(slot.day).date, scheduled: 0, attended: 1, converted: 0, live: true }] }))
  }
  flashSlot(b.slotId)
  return { ok: true }
}

export function undoCheckin(bookingId) {
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'reservado', checkin: null } : x)) }))
}

export function rotateQR(slotId) {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase()
  set({ qr: { slotId, token, issuedAt: Date.now(), ttl: 30 } })
}
export function clearQR() {
  set({ qr: null })
}

// Lê o QR "apontando a câmera" para a tela do coach. Valida token, turma e janela de horário.
export function scanQR(pid = ME_ID) {
  const s = state
  if (!s.qr) return { ok: false, msg: 'Nenhum QR Code ativo. Peça ao coach para exibir o QR da turma (Painel Coach → Turmas).' }
  const slot = slotById(s, s.qr.slotId)
  if (Date.now() - s.qr.issuedAt > s.qr.ttl * 1000 + 2000) return { ok: false, msg: 'QR Code expirado. Aguarde o coach gerar um novo.' }
  const b = s.bookings.find((x) => x.slotId === slot.id && x.personId === pid && active(x))
  if (!b) return { ok: false, msg: `Você não tem reserva em ${slotLabel(slot)}. Reserve a aula primeiro.` }
  if (b.status === 'presente') return { ok: false, msg: 'Presença já confirmada nesta aula.' }
  if (b.status === 'pre_reserva') return { ok: false, msg: 'Pagamento desta aula ainda pendente. Conclua o Pix/Cartão para confirmar a vaga.' }
  const m = minutesUntil(s, slot)
  if (m > 30 || m < -CLASS_DURATION) return { ok: false, msg: 'Fora da janela da aula. O QR só vale durante o horário da turma.' }
  checkin(b.id, 'qr')
  return { ok: true, slot }
}

/* ---------- Check-in por geolocalização ("Estou aqui") — confirmação principal ---------- */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}
// Distância atual do aluno até o box: GPS real do aparelho (se ativado) ou posição simulada da demo
export function distanceToBox(s) {
  if (s.realGps) return haversine(s.realGps.lat, s.realGps.lng, BOX.lat, BOX.lng)
  return s.gpsInside ? 38 : 2300
}
export function setRealGps(coords) {
  set({ realGps: coords })
}
export function gpsCheck(s, booking) {
  const m = minutesUntil(s, booking.slot)
  const w = BOX.checkinWindowMin
  const dist = distanceToBox(s)
  return {
    dist,
    inRadius: dist <= BOX.gpsRadiusM,
    inWindow: m <= w && m >= -w,
    minutesToOpen: Math.max(0, m - w),
    late: m < -w,
  }
}
export function checkinGPS(bookingId) {
  const b = state.bookings.find((x) => x.id === bookingId)
  if (!b) return { ok: false, msg: 'Reserva não encontrada.' }
  const g = gpsCheck(state, { ...b, slot: slotById(state, b.slotId) })
  if (!g.inWindow) return { ok: false, msg: g.late ? 'A janela de check-in desta aula já fechou.' : `O check-in libera ${BOX.checkinWindowMin} min antes da aula.` }
  if (!g.inRadius) return { ok: false, msg: `Você está a ${fmtDist(g.dist)} do box. Chegue a até ${BOX.gpsRadiusM} m para confirmar.` }
  const r = checkin(bookingId, 'gps')
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, checkin: { ...x.checkin, distance: g.dist } } : x)) }))
  return r
}
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`)

export function gpsEligible(s, pid = ME_ID) {
  const list = myBookings(s, pid).filter((b) => b.status === 'reservado')
  return list.find((b) => Math.abs(minutesUntil(s, b.slot)) <= BOX.checkinWindowMin) || null
}

export function closeClass(slotId) {
  const slot = slotById(state, slotId)
  const list = state.bookings.filter((b) => b.slotId === slotId)
  let present = 0
  let noshow = 0
  let cancelled = 0
  const noShowIds = []
  const bookings = state.bookings.map((b) => {
    if (b.slotId !== slotId) return b
    if (b.status === 'presente') {
      present++
      return b
    }
    if (b.status === 'cancelado') {
      cancelled++
      return b
    }
    if (b.status === 'expirado') return b
    noshow++
    noShowIds.push(b.personId)
    return { ...b, status: 'falta' }
  })
  const people = { ...state.people }
  for (const pid of noShowIds) {
    people[pid] = { ...people[pid], monthNoShows: (people[pid].monthNoShows || 0) + 1, consecutiveNoShows: (people[pid].consecutiveNoShows || 0) + 1, streak: 0 }
  }
  const rec = { date: dayByKey(slot.day).date, day: slot.day, time: slot.time, coach: slot.coach, slotId, booked: list.length, present, noshow, cancelled, live: true }
  set((s) => ({
    bookings,
    people,
    slots: s.slots.map((x) => (x.id === slotId ? { ...x, closed: true } : x)),
    history: [...s.history, rec],
    qr: s.qr?.slotId === slotId ? null : s.qr,
  }))
  log('coach', `Aula ${slotLabel(slot)} encerrada: ${present} presentes, ${cancelled} cancelados no prazo, ${noshow} faltas sem aviso`)
  return rec
}

export function convertTrial(personId) {
  const p = state.people[personId]
  set((s) => ({
    people: { ...s.people, [personId]: { ...p, role: 'aluno', plan: '3x', extraCredits: 0, converted: true } },
    trialHistory: [...s.trialHistory, { date: dayByKey(s.now.day).date, scheduled: 0, attended: 0, converted: 1, live: true }],
  }))
  log('coach', `${p.name.split(' ')[0]} foi matriculado(a) após aula experimental 🎯`)
  toast(`${p.name} convertido(a) em aluno(a)!`)
}

export function saveResult(bookingId, result) {
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, result } : x)) }))
  toast('Resultado registrado no seu histórico!')
}

/* ---------------- gestão ---------------- */
export function updateSlot(slotId, patch) {
  set((s) => ({ slots: s.slots.map((x) => (x.id === slotId ? { ...x, ...patch } : x)) }))
  flashSlot(slotId)
}
export function updateSettings(patch) {
  set((s) => ({ settings: { ...s.settings, ...patch } }))
  if ('graceDays' in patch) enforceBilling()
}
export function updateWod(day, patch) {
  set((s) => ({ wods: { ...s.wods, [day]: { ...s.wods[day], ...patch } } }))
}

/* ---------------- aniversariantes ---------------- */
// birth = 'AAAA-MM-DD'; compara só mês e dia
export const isBirthday = (p, isoDate) => !!p?.birth && p.birth.slice(5) === isoDate.slice(5)
export function monthBirthdays(s) {
  const today = dayByKey(s.now.day).date
  const month = today.slice(5, 7)
  return Object.values(s.people)
    .filter((p) => p.role === 'aluno' && p.birth?.slice(5, 7) === month)
    .map((p) => ({ ...p, bday: p.birth.slice(8), isToday: isBirthday(p, today), passed: p.birth.slice(8) < today.slice(8) }))
    .sort((a, b) => a.bday.localeCompare(b.bday))
}

/* ---------------- stories do coach (somem 24h depois) ---------------- */
export function storyAge(s, st) {
  return (dayIndex(s.now.day) - dayIndex(st.day)) * 1440 + s.now.min - st.min
}
export function activeStories(s) {
  return s.stories.filter((st) => {
    const a = storyAge(s, st)
    return a >= 0 && a < 1440
  })
}
export function addStory({ author, caption, image }) {
  const st = { id: nid('st'), author, caption, image, emoji: '📸', day: state.now.day, min: state.now.min }
  set((s) => ({ stories: [...s.stories, st] }))
  log('coach', `${author} publicou um story${caption ? `: “${caption.slice(0, 40)}”` : ''}`)
  return st
}
export function deleteStory(id) {
  set((s) => ({ stories: s.stories.filter((x) => x.id !== id) }))
}
export function markStorySeen(id) {
  if (state.storiesSeen[id]) return
  set((s) => ({ storiesSeen: { ...s.storiesSeen, [id]: true } }))
}

export function addNotice(n) {
  const notice = { id: nid('n'), date: dayByKey(state.now.day).date, whatsappSent: false, ...n }
  set((s) => ({ notices: [notice, ...s.notices] }))
  log('coach', `Novo aviso publicado: ${n.title}`)
  return notice
}
export function togglePin(id) {
  set((s) => ({ notices: s.notices.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)) }))
}
export function deleteNotice(id) {
  set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
}
export function dispatchUrgent(noticeId, dayKey) {
  const n = state.notices.find((x) => x.id === noticeId)
  const slotIds = state.slots.filter((x) => x.day === dayKey).map((x) => x.id)
  const recipients = new Set(state.bookings.filter((b) => slotIds.includes(b.slotId) && active(b)).map((b) => b.personId))
  set((s) => ({ notices: s.notices.map((x) => (x.id === noticeId ? { ...x, whatsappSent: true, sentTo: recipients.size, sentDay: dayKey } : x)) }))
  if (!state.settings.dispatches.urgent) {
    log('sistema', `Disparo “Aviso urgente” desligado no painel: aviso só no mural, nada enviado no WhatsApp`)
    return 0
  }
  for (const pid of recipients) dispatch('urgent', pid, `🚨 *AVISO URGENTE — ${BOX.name}*\n\n*${n.title}*\n${n.body}`, null, { silent: true })
  log('whatsapp', `Alerta urgente enviado para ${recipients.size} alunos inscritos na ${dayByKey(dayKey).label}`)
  return recipients.size
}

export function sendReminders() {
  if (!state.settings.dispatches.reminder) {
    log('sistema', 'Disparo “Lembrete anti-falta” desligado no painel: nenhum lembrete enviado (economia Meta)')
    toast('Lembrete anti-falta está desligado em Coach → Bot & Custos', 'err')
    return 0
  }
  const nowIdx = dayIndex(state.now.day)
  const nextDay = DAYS[Math.min(nowIdx + 1, DAYS.length - 1)].key
  const target = state.bookings.filter((b) => active(b) && b.status === 'reservado' && slotById(state, b.slotId).day === nextDay)
  const mine = myBookings(state).filter((b) => b.status === 'reservado' && slotStatus(state, b.slot) === 'open')
  const mineTarget = mine.filter((b) => b.slot.day === nextDay)
  const list = mineTarget.length ? mineTarget : mine.slice(0, 1)
  if (!list.length) {
    botSay('me', '⏰ (Simulação 20:00) Você não tem reservas para amanhã. Que tal garantir seu horário? Digite *2* para reservar.')
  }
  for (const b of list) {
    const isTomorrow = b.slot.day === nextDay
    dispatch(
      'reminder',
      ME_ID,
      `⏰ *Lembrete DS Agende*\nOi, Marina! ${isTomorrow ? 'Amanhã' : dayByKey(b.slot.day).label} você treina às *${b.slot.time}* com ${b.slot.coach}.\nWOD: *${state.wods[b.slot.day].name}* — ${state.wods[b.slot.day].desc}\n\nVai conseguir ir?`,
      [
        { label: '✅ Confirmar presença', value: `confirm:${b.id}` },
        { label: '❌ Liberar vaga', value: `release:${b.id}` },
      ],
      { silent: true },
    )
  }
  log('whatsapp', `Lembretes anti-falta enviados (${state.settings.reminderTime}) para ${new Set(target.map((b) => b.personId)).size || list.length} alunos`)
  return list.length
}

export function confirmPresence(bookingId) {
  set((s) => ({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, confirmed: true } : x)) }))
}

// via: 'bot' (API oficial, conta como disparo de marketing) | 'manual' (WhatsApp do próprio coach, sem custo de API)
export function sendRescue(pid, text, via = 'bot') {
  set((s) => ({ rescueSent: { ...s.rescueSent, [pid]: { at: clock(), text, via } } }))
  if (via === 'bot') dispatch('rescue', pid, text, null, { silent: true, force: true })
  log(via === 'bot' ? 'whatsapp' : 'coach', via === 'bot' ? `Resgate enviado pelo bot oficial para ${state.people[pid].name}` : `Coach abriu o WhatsApp próprio para chamar ${state.people[pid].name} (sem custo de API)`)
}

/* ---------------- disparos ativos do bot (controle de custo Meta) ---------------- */
// Toda mensagem que o ROBÔ inicia passa por aqui. Se o gestor desligou aquele disparo, nada é enviado.
// Se o aluno falou com o bot nas últimas 24h (janela de atendimento aberta), a mensagem é grátis.
export function dispatch(kind, pid, text, buttons, { silent = false, force = false } = {}) {
  const def = DISPATCHES.find((d) => d.k === kind)
  const first = state.people[pid]?.name.split(' ')[0] || 'contato'
  if (!force && !state.settings.dispatches[kind]) {
    if (!silent) log('sistema', `Disparo “${def.label}” desligado: nada enviado para ${first} (economia Meta)`)
    return false
  }
  const free = pid === ME_ID && state.chats.me.messages.some((m) => m.from === 'user')
  const cost = free ? 0 : META_PRICE[def.cat]
  set((s) => ({ metaLog: [...s.metaLog, { kind, pid, cost, free }] }))
  if (pid === ME_ID) botSay('me', text, buttons)
  if (!silent) log('whatsapp', `${def.label} → ${first}${free ? ' (janela de 24h aberta: grátis)' : ` (~${brl(cost)})`}`)
  return true
}

/* ---------------- financeiro: mensalidade, carência, bloqueio e pagamentos ---------------- */
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const diffDays = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000)
export const todayISO = (s) => dayByKey(s.now.day).date
const stamp = () => `${fmtDate(todayISO(state))} ${fromMin(state.now.min)}`
export const KIND_LABEL = { mensalidade: 'Mensalidade', dropin: 'Drop-in', extra: 'Treino extra' }
export const BILLING_LABEL = { pago: 'Em dia', carencia: 'Em carência', bloqueado: 'Bloqueado', na: '—' }

// Regra de confiança: venceu → carência de N dias treinando normalmente → bloqueio automático
export function billingStatus(s, pid) {
  const p = s.people[pid]
  if (!p || p.role !== 'aluno' || !p.dueDate) return { status: 'na' }
  const late = diffDays(todayISO(s), p.dueDate)
  const g = s.settings.graceDays
  if (late <= 0) return { status: 'pago', due: p.dueDate, daysToDue: -late }
  if (late <= g) return { status: 'carencia', due: p.dueDate, late, left: g - late }
  return { status: 'bloqueado', due: p.dueDate, late }
}

export const priceOf = (s, kind, plan) => (kind === 'mensalidade' ? s.settings.prices[plan] : s.settings.prices[kind])

function patchPerson(pid, patch) {
  set((s) => ({ people: { ...s.people, [pid]: { ...s.people[pid], ...patch } } }))
}

// Job diário (pg_cron no Supabase). Ao bloquear, libera as vagas futuras para a lista de espera.
export function enforceBilling({ silent = false } = {}) {
  for (const p of Object.values(state.people)) {
    if (p.role !== 'aluno') continue
    const bs = billingStatus(state, p.id)
    const first = p.name.split(' ')[0]
    if (bs.status === 'bloqueado' && !p.blockedAt) {
      const future = state.bookings.filter((b) => b.personId === p.id && (b.status === 'reservado' || b.status === 'pre_reserva') && slotStatus(state, slotById(state, b.slotId)) === 'open')
      patchPerson(p.id, { blockedAt: todayISO(state) })
      set((s) => ({ waitlist: Object.fromEntries(Object.entries(s.waitlist).map(([k, v]) => [k, v.filter((x) => x !== p.id)])) }))
      if (silent) {
        const ids = new Set(future.map((b) => b.id))
        set((s) => ({ bookings: s.bookings.map((b) => (ids.has(b.id) ? { ...b, status: 'cancelado', cancelledBy: 'sistema', cancelReason: 'inadimplencia' } : b)) }))
        continue
      }
      for (const b of future) cancel(b.id, 'sistema', { force: true, reason: 'inadimplencia' })
      log('sistema', `🔒 ${first} bloqueado(a) por inadimplência (venceu ${fmtDate(bs.due)}). ${future.length} reserva(s) futura(s) liberada(s) para a lista de espera`)
      if (p.id === ME_ID) toast('🔒 Acesso bloqueado: mensalidade em atraso. Regularize em Planos.', 'err')
      dispatch(
        'billing',
        p.id,
        `🔒 *Acesso suspenso — ${BOX.name}*\nOi, ${first}! Sua mensalidade venceu em ${fmtDate(bs.due)} e a carência de ${state.settings.graceDays} dias terminou.\nSuas reservas futuras foram liberadas. Assim que o pagamento for confirmado, sua reserva fixa volta sozinha.`,
        [{ label: '💳 Pagar agora', value: 'pagar' }],
      )
    } else if (bs.status !== 'bloqueado' && p.blockedAt) {
      patchPerson(p.id, { blockedAt: null })
    }
    if (bs.status === 'carencia' && p.graceNotified !== p.dueDate) {
      patchPerson(p.id, { graceNotified: p.dueDate })
      if (silent) continue
      dispatch(
        'billing',
        p.id,
        `⏳ *Lembrete de mensalidade*\nOi, ${first}! Sua mensalidade venceu em ${fmtDate(bs.due)}. Você continua treinando normalmente ${bs.left === 0 ? 'só até hoje (último dia de carência)' : `por mais ${bs.left} dia(s)`}.\nPague por Pix, cartão ou na recepção para não ter o acesso suspenso.`,
        [{ label: '💳 Pagar agora', value: 'pagar' }],
      )
    }
  }
}

/*
 * Gera a cobrança. Pix/Cartão online de aula avulsa (drop-in, treino extra) PRÉ-RESERVA a vaga por 15 min.
 * "Na recepção" confirma a vaga e deixa a cobrança pendente para baixa manual do gestor.
 * Em produção: Edge Function `create_charge` → gateway de pagamento; o webhook do gateway chama `confirm_payment`.
 */
export function startCheckout({ kind, personId = ME_ID, plan, slotId = null, method, source = 'web' }) {
  const p = state.people[personId]
  const finalPlan = kind === 'mensalidade' ? plan || p.plan : null
  const amount = priceOf(state, kind, finalPlan)
  const online = method === 'pix' || method === 'cartao'
  let booking = null
  if (slotId) {
    const r = book({ slotId, personId, type: kind, source, extra: online ? { status: 'pre_reserva', holdUntil: Date.now() + HOLD_MINUTES * 60000 } : { payPending: true } })
    if (!r.ok) return r
    booking = r.booking
  }
  const pay = { id: nid('pay'), personId, kind, plan: finalPlan, amount, method, status: 'pendente', createdAt: stamp(), bookingId: booking?.id || null, source }
  set((s) => ({
    payments: [
      pay,
      // só uma mensalidade pendente por aluno
      ...s.payments.map((x) => (kind === 'mensalidade' && x.kind === 'mensalidade' && x.personId === personId && x.status === 'pendente' ? { ...x, status: 'cancelado' } : x)),
    ],
    bookings: booking ? s.bookings.map((b) => (b.id === booking.id ? { ...b, paymentId: pay.id } : b)) : s.bookings,
  }))
  log(source, `Cobrança gerada: ${KIND_LABEL[kind]} ${brl(amount)} • ${PAY_METHODS[method].label} • ${p.name.split(' ')[0]}`)
  return { ok: true, payment: pay, booking: booking && { ...booking, paymentId: pay.id } }
}

// Webhook do gateway (Pix/Cartão) ou baixa manual do gestor (Dinheiro/Maquininha)
export function confirmPayment(paymentId, { method } = {}) {
  const pay = state.payments.find((x) => x.id === paymentId)
  if (!pay || pay.status !== 'pendente') return { ok: false, msg: 'Esta cobrança não está mais pendente.' }
  const b = pay.bookingId && state.bookings.find((x) => x.id === pay.bookingId)
  if (b && b.status === 'expirado') return { ok: false, msg: 'A pré-reserva expirou e a vaga voltou para a grade. Reserve de novo.' }
  const finalMethod = method || pay.method
  set((s) => ({
    payments: s.payments.map((x) => (x.id === paymentId ? { ...x, status: 'pago', paidAt: stamp(), method: finalMethod } : x)),
    bookings: b ? s.bookings.map((x) => (x.id === b.id ? { ...x, status: x.status === 'pre_reserva' ? 'reservado' : x.status, payPending: false, holdUntil: null } : x)) : s.bookings,
  }))
  const p = state.people[pay.personId]
  const first = p.name.split(' ')[0]
  let rebooked = []
  if (pay.kind === 'mensalidade') {
    const wasBlocked = billingStatus(state, p.id).status === 'bloqueado'
    let next = addDays(p.dueDate || todayISO(state), 30)
    while (next <= todayISO(state)) next = addDays(next, 30)
    patchPerson(p.id, { dueDate: next, plan: pay.plan, blockedAt: null, graceNotified: null })
    const rec = state.recurrences.find((r) => r.personId === p.id)
    if (wasBlocked && rec) rebooked = setRecurrence(p.id, rec.days, rec.time, 'sistema').created
  }
  if (b) flashSlot(b.slotId)
  log('sistema', `✅ Pagamento confirmado (${PAY_METHODS[finalMethod].label}): ${KIND_LABEL[pay.kind]} ${brl(pay.amount)} • ${first}${rebooked.length ? ` • reserva fixa reativada (${rebooked.length} aula(s))` : ''}`)
  if (p.id === ME_ID) toast(`✅ Pagamento confirmado: ${KIND_LABEL[pay.kind]} ${brl(pay.amount)}`)
  const nextDue = state.people[p.id].dueDate
  dispatch(
    'billing',
    p.id,
    `✅ *Pagamento confirmado!*\n${KIND_LABEL[pay.kind]}${pay.plan ? ` (${PLANS[pay.plan].label})` : ''}: ${brl(pay.amount)} via ${PAY_METHODS[finalMethod].label}.${pay.kind === 'mensalidade' ? `\nPróximo vencimento: ${fmtDate(nextDue)}.` : ''}${rebooked.length ? `\n🔁 Sua reserva fixa voltou: ${rebooked.map((x) => `${dayByKey(x.day).short} ${x.time}`).join(', ')}.` : ''}\nBom treino! 💪`,
    null,
    { silent: true },
  )
  return { ok: true, rebooked }
}

// Pré-reserva sem pagamento em 15 min → vaga volta para a grade (pg_cron a cada minuto)
export function expireHold(bookingId) {
  const b = state.bookings.find((x) => x.id === bookingId)
  if (!b || b.status !== 'pre_reserva') return
  set((s) => ({
    bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'expirado', holdUntil: null } : x)),
    payments: s.payments.map((x) => (x.id === b.paymentId ? { ...x, status: 'expirado' } : x)),
  }))
  const slot = slotById(state, b.slotId)
  log('sistema', `⌛ Pré-reserva de ${state.people[b.personId].name.split(' ')[0]} expirou sem pagamento: a vaga de ${slotLabel(slot)} voltou para a grade`)
  if (b.personId === ME_ID) toast(`⌛ Pré-reserva expirada: ${slotLabel(slot)} voltou para a grade`, 'err')
  flashSlot(b.slotId)
  promoteWaitlist(b.slotId)
}
export function expireHolds() {
  const now = Date.now()
  for (const b of state.bookings) if (b.status === 'pre_reserva' && b.holdUntil && b.holdUntil <= now) expireHold(b.id)
}

// Botão da demo: muda a situação da mensalidade da Marina para testar carência e bloqueio
export function demoSetBilling(mode, pid = ME_ID) {
  const t = todayISO(state)
  const g = state.settings.graceDays
  const due = mode === 'pago' ? addDays(t, 20) : mode === 'carencia' ? addDays(t, -1) : addDays(t, -(g + 1))
  patchPerson(pid, { dueDate: due, graceNotified: null })
  enforceBilling()
}

export function financeSummary(s) {
  const alunos = Object.values(s.people).filter((p) => p.role === 'aluno')
  const by = { pago: [], carencia: [], bloqueado: [] }
  for (const p of alunos) {
    const st = billingStatus(s, p.id).status
    if (by[st]) by[st].push(p)
  }
  const sum = (list) => list.reduce((a, p) => a + (s.settings.prices[p.plan] || 0), 0)
  const paid = s.payments.filter((x) => x.status === 'pago' && x.id !== 'pay_old1')
  return {
    by,
    total: alunos.length,
    mrr: sum(alunos),
    emDia: sum(by.pago),
    aberto: sum(by.carencia) + sum(by.bloqueado),
    pendentesRecepcao: s.payments.filter((x) => x.status === 'pendente' && x.method === 'recepcao'),
    recebidoDemo: paid.reduce((a, x) => a + x.amount, 0),
  }
}

export function setNow(now) {
  set({ now })
  enforceBilling()
}
export function setGps(v) {
  set({ gpsInside: v, realGps: null })
}
export function dismissCelebration() {
  set({ celebration: null })
}
export function demoBoost(kind) {
  awardFor(ME_ID, (x) => {
    if (kind === 'early') {
      x.early = Math.max(x.early || 0, 5)
      x.total = Math.max(x.total, 5)
    }
    if (kind === 'week') {
      x.week = Math.max(x.week || 0, 5)
      x.total = Math.max(x.total, 5)
    }
    if (kind === 'ten') x.total = Math.max(x.total, 10)
  })
}
export function resetDemo() {
  state = initialState()
  enforceBilling({ silent: true })
  emit()
}

// aplica a situação financeira inicial (bloqueados já sem reservas futuras)
enforceBilling({ silent: true })
