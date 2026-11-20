/*
 * Treino do Dia na Agenda do Aluno: busca os WODs da semana (daily_wods) e
 * recarrega quando a equipe publica/edita/remove (Realtime, se a tabela estiver
 * na publicação supabase_realtime; sem isso, recarrega ao voltar para a aba).
 * get(dia, modalidade) → treino daquela aula ou null.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWods, indexWods, wodKey } from '../lib/api/wods'

export function useWods(boxId, from, to) {
  const [rows, setRows] = useState([])

  const reload = useCallback(async () => {
    if (!boxId) return
    try {
      setRows(await fetchWods(boxId, from, to))
    } catch {
      // sem treino na tela não impede a reserva: só some o bloco "Treino do dia"
    }
  }, [boxId, from, to])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!supabase || !boxId) return
    const channel = supabase
      .channel(`wods:${boxId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_wods', filter: `box_id=eq.${boxId}` }, reload)
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [boxId, reload])

  const index = useMemo(() => indexWods(rows), [rows])
  const get = useCallback((day, modality) => (modality ? index[wodKey(day, modality)] || null : null), [index])
  return { rows, get, reload }
}
