/*
 * Horários fixos do aluno logado (migrations/20261130_horario_fixo.sql).
 *
 * Um estado só, compartilhado pela Agenda (marca o card "Horário fixo") e pelo
 * Perfil (lista e desativa). A Agenda casa a aula com o horário fixo por
 * dia da semana + 'HH:MI' — a grade tem unique (box_id, weekday, start_time).
 *
 * Só alunos com plano usam (visitante, drop-in e equipe: enabled = false).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMyRecurring } from '../lib/api/agenda'

export const slotKey = (weekday, startTime) => `${weekday}-${startTime}`

export function useRecurring(boxId, me) {
  const enabled = me?.role === 'aluno'
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error

  const reload = useCallback(async () => {
    if (!enabled || !boxId) return
    setStatus((s) => (s === 'ready' ? s : 'loading'))
    try {
      setRows(await fetchMyRecurring(boxId))
      setStatus('ready')
    } catch {
      setStatus('error') // sem a lista, o card só não mostra a marcação; o banco continua valendo
    }
  }, [enabled, boxId])

  useEffect(() => {
    setRows([])
    reload()
  }, [reload, me?.id])

  const active = useMemo(() => rows.filter((r) => r.active), [rows])
  const byKey = useMemo(() => new Map(active.map((r) => [slotKey(r.weekday, r.start_time), r])), [active])

  return { enabled, rows, active, byKey, status, reload }
}
