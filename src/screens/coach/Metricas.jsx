import { useMemo, useState } from 'react'
import { AlertOctagon, Download, Filter, MessageCircle, Send, UserSearch } from 'lucide-react'
import { BADGES, DAYS, META_PRICE, PLANS, WEEKDAY_TIMES, SATURDAY_TIMES, brl } from '../../lib/constants'
import { sendRescue, toast, updateSettings } from '../../lib/store'
import { Btn, Chip, Sheet, Stat, inputCls } from '../../components/ui'

const TODAY = '2026-11-12'
const PERIODS = {
  hoje: { label: 'Hoje', from: TODAY, to: TODAY },
  semana: { label: 'Semana', from: '2026-11-09', to: TODAY },
  mes: { label: 'Mês', from: '2026-10-13', to: TODAY },
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const sum = (arr, k) => arr.reduce((s, r) => s + r[k], 0)

function group(records, key) {
  const m = {}
  for (const r of records) {
    const k = r[key]
    m[k] ||= { booked: 0, present: 0, noshow: 0, cancelled: 0, classes: 0 }
    m[k].booked += r.booked
    m[k].present += r.present
    m[k].noshow += r.noshow
    m[k].cancelled += r.cancelled
    m[k].classes++
  }
  return m
}

export default function Metricas({ db }) {
  const [period, setPeriod] = useState('mes')
  const [custom, setCustom] = useState({ from: '2026-10-20', to: TODAY })
  const [rescue, setRescue] = useState(null)
  const [student, setStudent] = useState('me')
  const range = period === 'custom' ? custom : PERIODS[period]
  const recs = useMemo(() => db.history.filter((r) => r.date >= range.from && r.date <= range.to), [db.history, range.from, range.to])
  const trials = db.trialHistory.filter((r) => r.date >= range.from && r.date <= range.to)

  const booked = sum(recs, 'booked')
  const present = sum(recs, 'present')
  const noshow = sum(recs, 'noshow')
  const cancelled = sum(recs, 'cancelled')
  const attendBase = present + noshow
  const capTotal = recs.reduce((s, r) => s + (db.slots.find((x) => x.id === r.slotId)?.capacity || 12), 0)

  const byDay = group(recs, 'day')
  const byTime = group(recs, 'time')
  const byCoach = group(recs, 'coach')
  const maxDay = Math.max(1, ...Object.values(byDay).map((g) => g.present + g.noshow))
  const maxNsTime = Math.max(1, ...Object.values(byTime).map((g) => pct(g.noshow, g.present + g.noshow)))

  const tSched = sum(trials, 'scheduled')
  const tAtt = sum(trials, 'attended')
  const tConv = sum(trials, 'converted')

  const risk = Object.values(db.people)
    .filter((p) => p.role === 'aluno' && p.id !== 'me' && ((p.lastVisitDays ?? 0) > 7 || (p.consecutiveNoShows ?? 0) >= 2))
    .sort((a, b) => (b.lastVisitDays ?? 0) - (a.lastVisitDays ?? 0))

  const exportCSV = () => {
    const head = 'data,dia,horario,coach,reservas,presentes,cancelados_no_prazo,faltas_sem_aviso,taxa_noshow\n'
    const rows = recs.map((r) => [r.date, r.day, r.time, r.coach, r.booked, r.present, r.cancelled, r.noshow, pct(r.noshow, r.present + r.noshow) + '%'].join(',')).join('\n')
    const blob = new Blob(['﻿' + head + rows], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ds-agende-relatorio-${range.from}_a_${range.to}.csv`
    a.click()
    toast(`Relatório exportado (${recs.length} aulas)`)
  }

  const sp = db.people[student]

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <Filter size={14} className="shrink-0 text-fg-subtle" />
        {Object.entries(PERIODS).map(([k, v]) => (
          <Chip key={k} active={period === k} onClick={() => setPeriod(k)}>
            {v.label}
          </Chip>
        ))}
        <Chip active={period === 'custom'} onClick={() => setPeriod('custom')}>
          Personalizado
        </Chip>
        <button onClick={exportCSV} className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-fg-soft ring-1 ring-line">
          <Download size={13} /> CSV
        </button>
      </div>
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className={inputCls} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <input type="date" className={inputCls} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        </div>
      )}

      {!recs.length ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-fg-subtle">
          Nenhuma aula encerrada neste período ainda.
          <br />
          <span className="text-xs">Encerre uma aula em <b>Turmas</b> para ver o cruzamento reserva × presença aparecer aqui.</span>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Taxa de presença" value={`${pct(present, attendBase)}%`} sub={`${present} presenças confirmadas`} accent="text-highlight" />
            <Stat label="Faltas sem aviso" value={`${pct(noshow, attendBase)}%`} sub={`${noshow} no-shows`} accent="text-rose-400" />
            <Stat label="Cancelados no prazo" value={cancelled} sub={`${pct(cancelled, booked)}% das reservas`} />
            <Stat label="Ocupação média" value={`${pct(booked, capTotal)}%`} sub={`${recs.length} aulas encerradas`} />
          </div>

          {/* Por dia da semana */}
          <Card title="Presença × faltas por dia da semana">
            <Legend />
            <div className="mt-3 flex h-36 items-end gap-2">
              {DAYS.map((d) => {
                const g = byDay[d.key]
                if (!g) return <div key={d.key} className="flex-1" />
                const tot = g.present + g.noshow
                return (
                  <div key={d.key} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    <span className="mb-1 text-[10px] font-semibold text-fg-soft">{pct(g.noshow, tot)}%</span>
                    <div className="flex w-full max-w-[34px] flex-col gap-[2px]" style={{ height: `${(tot / maxDay) * 78}%` }}>
                      <div className="rounded-t-[4px] bg-rose-400" style={{ flex: g.noshow }} />
                      <div className="bg-faint" style={{ flex: g.present }} />
                    </div>
                    <span className="mt-1 text-[10px] font-bold text-fg-subtle">{d.short}</span>
                    <Tip>
                      {d.label}: {g.present} presentes • {g.noshow} faltas • {g.cancelled} cancel.
                    </Tip>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[10px] text-fg-subtle">% acima de cada barra = taxa de no-show</p>
          </Card>

          {/* Por horário */}
          <Card title="Taxa de no-show por horário">
            <div className="space-y-1.5">
              {[...WEEKDAY_TIMES, ...SATURDAY_TIMES.filter((t) => !WEEKDAY_TIMES.includes(t))].map((t) => {
                const g = byTime[t]
                if (!g) return null
                const r = pct(g.noshow, g.present + g.noshow)
                const worst = r === maxNsTime
                return (
                  <div key={t} className="group relative flex items-center gap-2 text-xs">
                    <span className="w-11 font-display text-sm font-bold">{t}</span>
                    <div className="h-3.5 flex-1 rounded-r-[4px] bg-elevated/50">
                      <div className={`h-full rounded-r-[4px] ${worst ? 'bg-rose-400' : 'bg-faint'}`} style={{ width: `${(r / maxNsTime) * 100}%` }} />
                    </div>
                    <span className={`w-20 text-right ${worst ? 'font-bold text-rose-300' : 'text-fg-muted'}`}>
                      {r}% • {g.noshow}
                    </span>
                    <Tip>
                      {t}: {g.noshow} faltas em {g.classes} aulas
                    </Tip>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Por coach */}
          <Card title="Por coach">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-fg-subtle">
                <tr>
                  <th className="pb-1 text-left font-semibold">Coach</th>
                  <th className="pb-1 text-right font-semibold">Aulas</th>
                  <th className="pb-1 text-right font-semibold">Presença</th>
                  <th className="pb-1 text-right font-semibold">Faltas</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byCoach).map(([k, g]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5 font-medium">{k}</td>
                    <td className="py-1.5 text-right text-fg-muted">{g.classes}</td>
                    <td className="py-1.5 text-right">{pct(g.present, g.present + g.noshow)}%</td>
                    <td className="py-1.5 text-right text-rose-300">
                      {g.noshow} ({pct(g.noshow, g.present + g.noshow)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Funil experimental */}
      <Card title="Funil de aulas experimentais">
        {[
          ['Agendadas', tSched, 100],
          ['Compareceram', tAtt, pct(tAtt, tSched)],
          ['Matricularam', tConv, pct(tConv, tSched)],
        ].map(([l, v, p], i) => (
          <div key={l} className="mb-2">
            <div className="flex justify-between text-xs">
              <span className="text-fg-soft">{l}</span>
              <span>
                <b className="font-display text-base">{v}</b> <span className="text-fg-subtle">{i ? `${p}%` : ''}</span>
              </span>
            </div>
            <div className="mt-0.5 h-2.5 rounded-r-[4px] bg-elevated/50">
              <div className={`h-full rounded-r-[4px] ${i === 2 ? 'bg-accent' : 'bg-faint'}`} style={{ width: `${p}%` }} />
            </div>
          </div>
        ))}
        <p className="text-[11px] text-fg-subtle">
          Conversão comparecimento → matrícula: <b className="text-highlight">{pct(tConv, tAtt)}%</b>
        </p>
      </Card>

      {/* Risco de evasão */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <AlertOctagon size={14} className="text-rose-400" /> Alunos sumidos ({risk.length})
          </span>
        }
      >
        <p className="mb-2 text-[11px] text-fg-subtle">Alunos com 2+ faltas seguidas ou mais de 7 dias sem check-in. Escolha como chamar cada um.</p>
        <label className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-surface/60 px-3 py-2 text-xs">
          <span>
            🤖 Disparo automático pelo bot oficial
            <span className="block text-[10px] text-fg-subtle">~{brl(META_PRICE.marketing)} por mensagem (Meta). Desligado: você chama pelo seu WhatsApp, sem custo.</span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-accent"
            checked={db.settings.dispatches.rescue}
            onChange={(e) => {
              updateSettings({ dispatches: { ...db.settings.dispatches, rescue: e.target.checked } })
              if (e.target.checked) {
                const pend = risk.filter((p) => !db.rescueSent[p.id])
                pend.forEach((p) => sendRescue(p.id, rescueText(p), 'bot'))
                if (pend.length) toast(`Bot enviou resgate para ${pend.length} aluno(s)`)
              }
            }}
          />
        </label>
        <div className="space-y-1.5">
          {risk.map((p) => {
            const sent = db.rescueSent[p.id]
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-rose-500/5 px-3 py-2 ring-1 ring-rose-500/20">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-[10px] text-fg-muted">
                    {(p.lastVisitDays ?? 0) > 7 && <span className="text-rose-300">{p.lastVisitDays} dias sem treinar</span>}
                    {(p.lastVisitDays ?? 0) > 7 && (p.consecutiveNoShows ?? 0) >= 2 && ' • '}
                    {(p.consecutiveNoShows ?? 0) >= 2 && <span className="text-amber-300">{p.consecutiveNoShows} faltas seguidas</span>} • plano {PLANS[p.plan].label}
                  </div>
                </div>
                {sent ? (
                  <span className="text-right text-[10px] font-semibold text-emerald-700 dark:text-wa-light">
                    ✓ {sent.via === 'manual' ? 'chamado no seu WhatsApp' : 'enviado pelo bot'}
                    <br />
                    {sent.at}
                  </span>
                ) : (
                  <button onClick={() => setRescue(p)} className="flex items-center gap-1 rounded-lg bg-wa-light px-2 py-1 text-[10px] font-bold text-white">
                    <MessageCircle size={12} /> Chamar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Histórico individual */}
      <Card
        title={
          <span className="flex items-center gap-1.5">
            <UserSearch size={14} /> Histórico individual
          </span>
        }
      >
        <select className={inputCls} value={student} onChange={(e) => setStudent(e.target.value)}>
          {Object.values(db.people)
            .filter((p) => p.role === 'aluno')
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Stat label="Treinos" value={sp.total} />
          <Stat label="Faltas mês" value={sp.monthNoShows || 0} accent={sp.monthNoShows ? 'text-rose-400' : 'text-fg'} />
          <Stat label="Streak" value={sp.streak || 0} />
          <Stat label="Mês" value={sp.monthCount || 0} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {sp.badges.length ? (
            sp.badges.map((id) => {
              const b = BADGES.find((x) => x.id === id)
              return (
                <span key={id} className="rounded-full bg-surface px-2 py-0.5 text-[11px] ring-1 ring-line">
                  {b.emoji} {b.name}
                </span>
              )
            })
          ) : (
            <span className="text-[11px] text-fg-subtle">Nenhum selo ainda.</span>
          )}
        </div>
      </Card>

      <RescueSheet p={rescue} onClose={() => setRescue(null)} />
    </div>
  )
}

function Card({ title, children }) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-fg-muted">{title}</h3>
      {children}
    </section>
  )
}

function Legend() {
  return (
    <div className="flex gap-3 text-[10px] text-fg-muted">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-faint" /> Presentes
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-rose-400" /> Faltas sem aviso
      </span>
    </div>
  )
}

function Tip({ children }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-[200px] -translate-x-1/2 rounded-lg bg-inverse px-2 py-1 text-[10px] font-semibold text-on-inverse shadow-lg group-hover:block">
      {children}
    </div>
  )
}

const rescueText = (p) =>
  `Oi, ${p.name.split(' ')[0]}! 💛 Sentimos sua falta no Içara Cross. Está tudo bem? Separamos uma vaga para você nesta semana — responda *1* que eu já reservo seu horário favorito. Bora voltar com tudo? 💪`

function RescueSheet({ p, onClose }) {
  const [text, setText] = useState('')
  const open = !!p
  const tpl = p ? rescueText(p) : ''
  return (
    <Sheet open={open} onClose={onClose} title="Mensagem de resgate">
      {p && (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            Para: <b className="text-fg">{p.name}</b> • {p.phone}
          </p>
          <textarea className={inputCls} rows={5} defaultValue={tpl} onChange={(e) => setText(e.target.value)} />
          <a
            href={`https://wa.me/55${p.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text || tpl)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              sendRescue(p.id, text || tpl, 'manual')
              onClose()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-wa-light px-4 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle size={16} /> Abrir no meu WhatsApp • sem custo
          </a>
          <Btn
            variant="dark"
            className="w-full"
            onClick={() => {
              sendRescue(p.id, text || tpl, 'bot')
              toast(`Bot oficial enviou o resgate para ${p.name.split(' ')[0]}`)
              onClose()
            }}
          >
            <Send size={16} /> Enviar pelo bot oficial • ~{brl(META_PRICE.marketing)}
          </Btn>
        </div>
      )}
    </Sheet>
  )
}

