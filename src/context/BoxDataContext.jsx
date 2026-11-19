/*
 * Contexto de dados real (Supabase) — substitui o store em memória da demo.
 *
 * Fluxo:
 *   1. Busca inicial: pessoa logada, grade, aulas do dia, minhas reservas/fila
 *      (+ chamada completa se for coach/owner).
 *   2. Realtime: um único canal por box+dia escutando INSERT/UPDATE/DELETE em
 *      class_sessions, bookings e waitlist. Qualquer reserva feita pelo app,
 *      pelo WhatsApp ou pelo coach aparece em todas as telas abertas.
 *   3. Ações (reservar, cancelar, check-in, encerrar) chamam as RPCs e mostram Toast.
 *      Não há atualização otimista: a tela muda quando o banco confirma via Realtime.
 *
 * Uso:
 *   <BoxDataProvider boxId={id} notify={toast}> <App/> </BoxDataProvider>
 *   const { sessions, myBookingBySession, actions } = useBoxData()
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { toFriendlyError } from '../lib/api/errors'
import * as api from '../lib/api/rpc'
import {
  fetchDaySessions,
  fetchMe,
  fetchMyBookings,
  fetchMyWaitlist,
  fetchPersonLite,
  fetchRoster,
  fetchSlots,
  todayInBox,
} from '../lib/api/queries'

const BoxDataContext = createContext(null)

/* ---------------- estado ---------------- */

const initialState = {
  status: 'idle', // idle | loading | ready | error
  loadedOnce: false, // true após a 1ª carga; recargas seguintes não piscam a tela nem refazem o canal
  error: null,
  realtime: 'off', // off | connecting | live | error
  me: null,
  slots: [],
  sessions: {}, // id → class_session (+ slot)
  bookings: {}, // id → booking (aluno: só as dele; staff: todas do dia)
  waitlist: {}, // session_id → { position } (só do usuário logado)
}

const byId = (rows, key = 'id') => Object.fromEntries(rows.map((r) => [r[key], r]))

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, status: state.loadedOnce ? state.status : 'loading', error: null }
    case 'LOAD_OK':
      return { ...state, status: 'ready', loadedOnce: true, ...action.payload }
    case 'LOAD_ERR':
      return { ...state, status: 'error', error: action.error }
    case 'REALTIME':
      return { ...state, realtime: action.status }

    case 'SESSION_UPSERT': {
      const prev = state.sessions[action.row.id]
      // o payload do Realtime não traz o join com schedule_slots: preservamos o que já tínhamos
      return { ...state, sessions: { ...state.sessions, [action.row.id]: { ...prev, ...action.row, slot: prev?.slot } } }
    }
    case 'SESSION_DELETE': {
      const { [action.id]: _, ...rest } = state.sessions
      return { ...state, sessions: rest }
    }

    case 'BOOKING_UPSERT': {
      const prev = state.bookings[action.row.id]
      return { ...state, bookings: { ...state.bookings, [action.row.id]: { ...prev, ...action.row } } }
    }
    case 'BOOKING_DELETE': {
      const { [action.id]: _, ...rest } = state.bookings
      return { ...state, bookings: rest }
    }

    case 'WAITLIST_UPSERT':
      return { ...state, waitlist: { ...state.waitlist, [action.row.session_id]: action.row } }
    case 'WAITLIST_DELETE': {
      const { [action.sessionId]: _, ...rest } = state.waitlist
      return { ...state, waitlist: rest }
    }
    default:
      return state
  }
}

const isStaffRole = (me) => me?.role === 'owner' || me?.role === 'coach'

/* ---------------- provider ---------------- */

export function BoxDataProvider({ boxId, day: dayProp, notify = () => {}, children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const day = dayProp || todayInBox()

  // refs para os handlers do Realtime lerem o valor atual sem recriar o canal
  const stateRef = useRef(state)
  stateRef.current = state
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  /* ---------- 1. busca inicial ---------- */
  const load = useCallback(async () => {
    if (!supabase || !boxId) return
    dispatch({ type: 'LOAD_START' })
    try {
      const [me, slots, sessions] = await Promise.all([fetchMe(boxId), fetchSlots(boxId), fetchDaySessions(boxId, day)])
      const ids = sessions.map((s) => s.id)
      const [bookings, waitlist] = await Promise.all([
        isStaffRole(me) ? fetchRoster(ids) : fetchMyBookings(me?.id, ids),
        fetchMyWaitlist(me?.id, ids),
      ])
      dispatch({
        type: 'LOAD_OK',
        payload: { me, slots, sessions: byId(sessions), bookings: byId(bookings), waitlist: byId(waitlist, 'session_id') },
      })
    } catch (err) {
      const fe = toFriendlyError(err)
      dispatch({ type: 'LOAD_ERR', error: fe })
      notifyRef.current(fe.message, 'err')
    }
  }, [boxId, day])

  useEffect(() => {
    load()
  }, [load])

  /* ---------- 2. Realtime ---------- */
  const meId = state.me?.id
  const staff = isStaffRole(state.me)

  useEffect(() => {
    // só assina depois de saber quem é o usuário (o filtro da fila depende disso)
    if (!supabase || !boxId || !state.loadedOnce) return

    const inToday = (sessionId) => Boolean(stateRef.current.sessions[sessionId])
    let wasLive = false

    const channel = supabase
      .channel(`box:${boxId}:${day}`)

      // Aulas: capacidade alterada, encerramento, contadores de vagas/fila (trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_sessions', filter: `box_id=eq.${boxId}` }, (p) => {
        if (p.eventType === 'DELETE') return dispatch({ type: 'SESSION_DELETE', id: p.old.id })
        if (p.eventType === 'INSERT') return load() // aula nova (ex.: aulão extra) → recarrega com o join da turma
        if (inToday(p.new.id)) dispatch({ type: 'SESSION_UPSERT', row: p.new })
      })

      // Reservas: o RLS já filtra — aluno recebe só as dele, coach recebe todas do box.
      // (bookings não tem box_id, por isso filtramos pelo conjunto de aulas do dia.)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async (p) => {
        if (p.eventType === 'DELETE') return dispatch({ type: 'BOOKING_DELETE', id: p.old.id })
        const row = p.new
        if (!inToday(row.session_id)) return
        // coach: anexa o nome do aluno que acabou de reservar
        if (staff && !stateRef.current.bookings[row.id]?.person) {
          const person = await fetchPersonLite(row.person_id).catch(() => null)
          return dispatch({ type: 'BOOKING_UPSERT', row: { ...row, person } })
        }
        dispatch({ type: 'BOOKING_UPSERT', row })
        // aviso de promoção da lista de espera
        if (p.eventType === 'INSERT' && row.person_id === meId && row.source === 'sistema') {
          notifyRef.current('Abriu vaga e você saiu da lista de espera. Vaga garantida! 🎉', 'ok')
        }
      })

    // Lista de espera do próprio aluno (a contagem geral vem em class_sessions.waitlist_count)
    if (meId) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist', filter: `person_id=eq.${meId}` }, (p) => {
        if (p.eventType === 'DELETE') return dispatch({ type: 'WAITLIST_DELETE', sessionId: p.old.session_id })
        if (inToday(p.new.session_id)) dispatch({ type: 'WAITLIST_UPSERT', row: p.new })
      })
    }

    dispatch({ type: 'REALTIME', status: 'connecting' })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        dispatch({ type: 'REALTIME', status: 'live' })
        // reconectou depois de cair: eventos perdidos no meio → recarrega
        if (wasLive) load()
        wasLive = true
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        dispatch({ type: 'REALTIME', status: 'error' }) // supabase-js tenta reconectar sozinho
      }
    })

    // PWA: ao voltar do segundo plano, o socket pode ter dormido → sincroniza
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)

    // Desmontagem: remove o canal e o listener (evita memory leak e eventos duplicados)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
      dispatch({ type: 'REALTIME', status: 'off' })
    }
    // o canal só é refeito se mudar box, dia ou usuário
  }, [boxId, day, meId, staff, state.loadedOnce, load])

  /* ---------- 3. ações (RPC + Toast) ---------- */
  const actions = useMemo(() => {
    const run = async (promise) => {
      const res = await promise
      notifyRef.current(res.message, res.ok ? 'ok' : 'err')
      return res
    }
    const personId = () => stateRef.current.me?.id
    return {
      book: (sessionId, opts = {}) => run(api.bookClass({ sessionId, personId: opts.personId ?? personId(), ...opts })),
      cancel: (bookingId, opts = {}) => run(api.cancelBooking({ bookingId, ...opts })),
      checkinQr: (sessionId, token) => run(api.checkinQr({ sessionId, token, personId: personId() })),
      closeSession: (sessionId) => run(api.closeSession({ sessionId })),
      joinWaitlist: (sessionId) => run(api.joinWaitlist({ sessionId, personId: personId() })),
      leaveWaitlist: (sessionId) => run(api.leaveWaitlist({ sessionId, personId: personId() })),
      refresh: load,
    }
  }, [load])

  /* ---------- dados derivados para as telas ---------- */
  const value = useMemo(() => {
    const sessions = Object.values(state.sessions).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const bookings = Object.values(state.bookings)
    const ACTIVE = ['reservado', 'presente', 'pre_reserva']
    const myBookingBySession = {}
    const rosterBySession = {}
    for (const b of bookings) {
      if (b.person_id === meId && ACTIVE.includes(b.status)) myBookingBySession[b.session_id] = b
      ;(rosterBySession[b.session_id] ||= []).push(b)
    }
    return {
      ...state,
      day,
      isStaff: staff,
      sessions,
      myBookingBySession,
      myWaitlistBySession: state.waitlist,
      rosterBySession, // só tem conteúdo para coach/owner
      // exibição apenas: a decisão de lotação é sempre do book_class no banco
      capacityOf: (s) => s.capacity_override ?? s.slot?.capacity ?? 0,
      actions,
    }
  }, [state, day, meId, staff, actions])

  return <BoxDataContext.Provider value={value}>{children}</BoxDataContext.Provider>
}

export function useBoxData() {
  const ctx = useContext(BoxDataContext)
  if (!ctx) throw new Error('useBoxData precisa estar dentro de <BoxDataProvider>')
  return ctx
}
