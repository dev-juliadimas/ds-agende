/*
 * Estado da Agenda do Aluno: busca inicial + Realtime.
 *
 * - Busca: uma chamada de get_agenda traz a semana inteira (com modalidade, coach,
 *   vagas e a situação do aluno logado).
 * - Realtime (um canal por box):
 *     class_sessions UPDATE → booked_count / waitlist_count chegam de todas as
 *       reservas do box (o trigger de 20261118_session_counters.sql mantém o contador),
 *       e a contagem de vagas muda na tela na hora.
 *     class_sessions INSERT → aula nova gerada pela grade → recarrega.
 *     bookings INSERT/UPDATE do próprio aluno → ex.: promovido da lista de espera,
 *       reserva cancelada pelo coach → recarrega para atualizar "Inscrito"/"Na fila".
 *   (DELETE não aceita filtro no Realtime; a saída da fila é feita pelo próprio aluno
 *    e a tela recarrega depois da ação.)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAgenda } from '../lib/api/agenda'
import { toFriendlyError } from '../lib/api/errors'

export function useAgenda(boxId, personId, days = 7) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [live, setLive] = useState('off') // off | connecting | live | error
  const timer = useRef(null)
  const loadedOnce = useRef(false)

  const reload = useCallback(async () => {
    if (!boxId || !personId) return
    if (!loadedOnce.current) setStatus('loading')
    try {
      const data = await fetchAgenda(boxId, days)
      setRows(data)
      setStatus('ready')
      setError(null)
      loadedOnce.current = true
    } catch (err) {
      setError(toFriendlyError(err))
      setStatus('error')
    }
  }, [boxId, personId, days])

  // várias mudanças seguidas (ex.: cancelamento + promoção) viram uma recarga só
  const reloadSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(reload, 250)
  }, [reload])

  useEffect(() => {
    loadedOnce.current = false
    setRows([])
    reload()
  }, [reload])

  useEffect(() => {
    if (!supabase || !boxId || !personId) return
    setLive('connecting')
    const channel = supabase
      .channel(`agenda:${boxId}:${personId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'class_sessions', filter: `box_id=eq.${boxId}` }, ({ new: s }) => {
        setRows((prev) =>
          prev.map((r) =>
            r.session_id === s.id
              ? {
                  ...r,
                  booked_count: s.booked_count,
                  waitlist_count: s.waitlist_count,
                  cancelled: s.cancelled,
                  closed: s.closed_at != null,
                  capacity: s.capacity_override ?? r.capacity,
                }
              : r,
          ),
        )
        // capacidade voltou ao padrão da turma: o valor só vem do join → recarrega
        if (s.capacity_override == null) reloadSoon()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_sessions', filter: `box_id=eq.${boxId}` }, reloadSoon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `person_id=eq.${personId}` }, reloadSoon)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `person_id=eq.${personId}` }, reloadSoon)
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          setLive('live')
          reloadSoon() // pega o que mudou enquanto o canal conectava/reconectava
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setLive('error')
        else if (st === 'CLOSED') setLive('off')
      })

    // celular volta do bloqueio de tela: o WebSocket pode ter caído
    const onVisible = () => document.visibilityState === 'visible' && reloadSoon()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [boxId, personId, reloadSoon])

  return { rows, status, error, live, reload }
}
