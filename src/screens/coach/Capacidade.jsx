import { useState } from 'react'
import { Minus, Plus, CalendarCog, Settings2, Store, Lock, MapPin, ShieldAlert } from 'lucide-react'
import { COACHES, DAYS, LEVELS, ME_ID, PENALTIES, dayByKey, fmtDate } from '../../lib/constants'
import { activePenalty, demoNoShow, demoResetNoShows, fmtHours, salesStatus, slotCounts, toast, updateSettings, updateSlot, updateWod } from '../../lib/store'
import { Btn, Field, inputCls } from '../../components/ui'

function Stepper({ value, onChange, min = 0, max = 40 }) {
  return (
    <div className="flex items-center rounded-xl bg-surface ring-1 ring-line">
      <button className="p-1.5 text-fg-muted hover:text-fg disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Diminuir">
        <Minus size={14} />
      </button>
      <span className="w-7 text-center font-display text-lg font-bold">{value}</span>
      <button className="p-1.5 text-fg-muted hover:text-fg disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Aumentar">
        <Plus size={14} />
      </button>
    </div>
  )
}

function SaleRow({ db, slot }) {
  const st = salesStatus(db, slot)
  return (
    <div className={`mt-2 flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-[11px] ring-1 ${st.open ? 'bg-emerald-500/5 ring-emerald-500/20' : 'bg-surface ring-line-strong'}`}>
      <span className={`flex items-center gap-1 ${st.open ? 'text-emerald-300' : 'text-fg-muted'}`}>
        {st.open ? <Store size={12} /> : <Lock size={12} />}
        {st.open ? 'Vendendo' : 'Venda bloqueada'}
        {st.pct != null && !st.manual && <span className="text-fg-subtle">• {st.pct}% ocupado</span>}
      </span>
      <select className="rounded-lg bg-surface px-2 py-1 text-[11px] ring-1 ring-line" value={slot.salesBlock || 'auto'} onChange={(e) => updateSlot(slot.id, { salesBlock: e.target.value })}>
        <option value="auto">Seguir regra</option>
        <option value="open">Sempre vender</option>
        <option value="blocked">Bloquear venda</option>
      </select>
    </div>
  )
}

// Check-in por geolocalização: liga/desliga e raio de tolerância (boxes.gps_checkin_enabled / gps_radius_m)
function GpsSettings({ db }) {
  const on = db.settings.gpsEnabled !== false
  const radius = db.settings.gpsRadiusM
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <MapPin size={14} /> Check-in por GPS
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          {on ? 'Ativado' : 'Desativado'}
          <input
            type="checkbox"
            className="h-5 w-5 accent-accent"
            checked={on}
            onChange={(e) => {
              updateSettings({ gpsEnabled: e.target.checked })
              toast(e.target.checked ? '📍 Check-in por GPS ativado' : 'Check-in por GPS desativado — alunos usam o QR Code')
            }}
          />
        </label>
      </div>
      <div role="group" aria-label="Raio de tolerância">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-fg-muted">Raio de tolerância</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1 ring-1 ring-line">
          {[30, 50, 100].map((m) => (
            <button
              key={m}
              disabled={!on}
              onClick={() => updateSettings({ gpsRadiusM: m })}
              className={`rounded-lg py-1.5 text-xs font-bold disabled:opacity-40 ${radius === m ? 'bg-inverse text-on-inverse' : 'text-fg-muted'}`}
            >
              {m} m
            </button>
          ))}
        </div>
        <span className="mt-1 block text-[11px] text-fg-subtle">Distância máxima do box para o aluno confirmar presença pelo GPS.</span>
      </div>
      {!on && <p className="mt-2 text-[11px] text-fg-subtle">Com o GPS desligado, o aluno confirma presença pelo QR Code da turma ou o coach marca na chamada.</p>}
    </div>
  )
}

// Regra Anti-Falta: penalidade automática ao atingir o limite de faltas sem aviso no mês
function NoShowRuleCard({ db }) {
  const rule = db.settings.noShowRule
  const set = (patch) => updateSettings({ noShowRule: { ...rule, ...patch } })
  const me = db.people[ME_ID]
  const penalized = Object.values(db.people).filter((p) => p.role === 'aluno' && activePenalty(db, p.id))
  return (
    <div className={`rounded-2xl p-4 ring-1 ${rule.enabled ? 'bg-rose-500/5 ring-rose-500/30' : 'bg-card ring-line'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <ShieldAlert size={14} /> Regra Anti-Falta (penalidade por no-show)
        </div>
        <Btn
          variant={rule.enabled ? 'dark' : 'primary'}
          className="shrink-0 px-3 py-1.5 text-xs"
          onClick={() => {
            set({ enabled: !rule.enabled })
            toast(rule.enabled ? 'Regra anti-falta desativada' : `⚠️ Regra anti-falta ativada: ${rule.tolerance} faltas sem aviso no mês → ${PENALTIES[rule.penalty].label.toLowerCase()}`)
          }}
        >
          {rule.enabled ? 'Desativar' : 'Ativar'}
        </Btn>
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">Quem reserva e não aparece sem avisar segura a vaga de outro aluno. Com a regra ativa, a penalidade é aplicada sozinha ao encerrar a aula.</p>

      {rule.enabled && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cancelar sem falta até" hint="Mesmo prazo das Regras do box.">
              <select className={inputCls} value={db.settings.minCancelHours} onChange={(e) => updateSettings({ minCancelHours: Number(e.target.value) })}>
                {[0.5, 1, 2, 3, 4, 6, 12, 24].map((h) => (
                  <option key={h} value={h}>
                    {fmtHours(h)} antes da aula
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tolerância no mês" hint="Faltas sem aviso até a punição.">
              <div className="flex items-center gap-2">
                <Stepper value={rule.tolerance} min={1} max={6} onChange={(v) => set({ tolerance: v })} />
                <span className="text-xs text-fg-muted">falta{rule.tolerance > 1 ? 's' : ''}</span>
              </div>
            </Field>
          </div>

          <div role="radiogroup" aria-label="Tipo de penalidade">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-fg-muted">Tipo de penalidade</span>
            <div className="space-y-1.5">
              {Object.entries(PENALTIES).map(([k, v]) => (
                <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-xs ring-1 ${rule.penalty === k ? 'bg-accent/10 ring-accent/50' : 'bg-surface ring-line'}`}>
                  <input type="radio" name="noshow-penalty" className="mt-0.5 accent-accent" checked={rule.penalty === k} onChange={() => set({ penalty: k })} />
                  <span>
                    <b className="block text-fg">{v.label}</b>
                    <span className="text-fg-subtle">{v.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <p className="rounded-xl bg-surface px-3 py-2 text-[11px] text-fg-muted ring-1 ring-line">
            Resumo: cancelou com menos de <b className="text-fg">{fmtHours(db.settings.minCancelHours)}</b> ou não apareceu = falta. Ao chegar a <b className="text-fg">{rule.tolerance}</b> no mês: <b className="text-fg">{PENALTIES[rule.penalty].label.toLowerCase()}</b>. O coach pode abonar a falta em Turmas.
          </p>

          {penalized.length > 0 && (
            <div className="text-[11px] text-fg-muted">
              <b className="text-rose-600 dark:text-rose-300">Com penalidade ativa:</b> {penalized.map((p) => `${p.name.split(' ')[0]} (${p.monthNoShows} faltas)`).join(', ')}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-line-strong p-2.5">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Demo • {me.name.split(' ')[0]} tem {me.monthNoShows || 0} falta(s) no mês</div>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="dark" className="text-xs" onClick={() => (demoNoShow(), toast(`Falta registrada para ${me.name.split(' ')[0]}`))}>
                Registrar falta
              </Btn>
              <Btn variant="dark" className="text-xs" onClick={() => (demoResetNoShows(), toast('Faltas zeradas e penalidade retirada'))}>
                Zerar faltas
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Capacidade({ db }) {
  const [day, setDay] = useState(db.now.day)
  const slots = db.slots.filter((s) => s.day === day)
  const wod = db.wods[day]
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <Settings2 size={14} /> Regras do box
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cancelar até" hint="Depois disso, o aluno não cancela nem troca pelo app/WhatsApp.">
            <select className={inputCls} value={db.settings.minCancelHours} onChange={(e) => updateSettings({ minCancelHours: Number(e.target.value) })}>
              {[0, 0.5, 1, 2, 3, 4, 6, 8, 12, 24, 48].map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? 'Até o início da aula' : `${fmtHours(h)} antes`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reservar com até" hint="Quantos dias à frente a agenda fica aberta.">
            <select className={inputCls} value={db.settings.bookAheadDays} onChange={(e) => updateSettings({ bookAheadDays: Number(e.target.value) })}>
              {[0, 1, 2, 3, 5, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? 'Só no dia' : d === 1 ? '1 dia antes' : `${d} dias antes`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lembrete anti-falta">
            <select className={inputCls} value={db.settings.reminderTime} onChange={(e) => updateSettings({ reminderTime: e.target.value })}>
              {['19:00', '20:00', '21:00'].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <NoShowRuleCard db={db} />

      <GpsSettings db={db} />

      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <Store size={14} /> Venda avulsa (experimental, drop-in, Pix)
        </div>
        <p className="mb-3 text-[11px] text-fg-subtle">Venda só nos horários mais vazios. Acima do limite, a aula aparece bloqueada para visitantes. Alunos matriculados continuam reservando.</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 ring-1 ring-line">
          {[
            ['livre', 'Qualquer horário'],
            ['auto', 'Só horários vazios'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => updateSettings({ salesMode: k })} className={`rounded-lg py-1.5 text-xs font-bold ${db.settings.salesMode === k ? 'bg-accent text-ink' : 'text-fg-muted'}`}>
              {l}
            </button>
          ))}
        </div>
        {db.settings.salesMode === 'auto' && (
          <div className="mt-3">
            <div className="flex justify-between text-xs">
              <span className="text-fg-muted">Bloquear venda a partir de</span>
              <b className="font-display text-lg">{db.settings.salesMaxPct}% de ocupação</b>
            </div>
            <input type="range" min={30} max={100} step={5} value={db.settings.salesMaxPct} onChange={(e) => updateSettings({ salesMaxPct: Number(e.target.value) })} className="w-full accent-accent" />
          </div>
        )}
        <p className="mt-2 text-[11px] text-fg-subtle">
          Hoje: <b className="text-fg">{db.slots.filter((s) => s.day === db.now.day && !salesStatus(db, s).open).length}</b> de {db.slots.filter((s) => s.day === db.now.day).length} horários bloqueados para venda. Exceções por horário abaixo.
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {DAYS.map((d) => (
          <button key={d.key} onClick={() => setDay(d.key)} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${day === d.key ? 'bg-inverse text-on-inverse' : 'bg-card text-fg-muted ring-1 ring-line'}`}>
            {d.short}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-muted">WOD de {dayByKey(day).label}</div>
        <input className={`${inputCls} font-display text-lg font-bold`} value={wod.name} onChange={(e) => updateWod(day, { name: e.target.value })} />
        <textarea className={`${inputCls} mt-2`} rows={2} value={wod.desc} onChange={(e) => updateWod(day, { desc: e.target.value })} />
      </div>

      <div className="space-y-2.5">
        {slots.map((s) => {
          const c = slotCounts(db, s.id)
          return (
            <div key={`${s.id}-${db.flash[s.id] || ''}`} className={`rounded-2xl bg-card/70 p-3 ring-1 ring-line ${db.flash[s.id] ? 'animate-flash' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-14 font-display text-2xl font-extrabold">{s.time}</span>
                <select className="flex-1 rounded-lg bg-surface px-2 py-1.5 text-xs ring-1 ring-line" value={s.level} onChange={(e) => updateSlot(s.id, { level: e.target.value })}>
                  {Object.entries(LEVELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <select className="w-[104px] rounded-lg bg-surface px-2 py-1.5 text-xs ring-1 ring-line" value={s.coach} onChange={(e) => updateSlot(s.id, { coach: e.target.value })}>
                  {COACHES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-fg-muted">
                <div className="flex items-center justify-between rounded-xl bg-surface/50 px-2 py-1.5">
                  <span>Capacidade fixa</span>
                  <Stepper value={s.capacity} min={1} onChange={(v) => updateSlot(s.id, { capacity: v })} />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-surface/50 px-2 py-1.5">
                  <span>Cota experim.</span>
                  <Stepper value={s.trialQuota} max={6} onChange={(v) => updateSlot(s.id, { trialQuota: v })} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-orange-500/5 px-2 py-1.5 text-[11px] ring-1 ring-orange-500/20">
                <label className="flex items-center gap-1.5 text-orange-200">
                  <input
                    type="checkbox"
                    className="accent-orange-400"
                    checked={s.override != null}
                    onChange={(e) => {
                      updateSlot(s.id, { override: e.target.checked ? Math.max(1, s.capacity - 4) : null })
                      if (e.target.checked) toast(`Lotação ajustada só para ${fmtDate(dayByKey(s.day).date)} ${s.time}. Grade fixa preservada.`)
                    }}
                  />
                  <CalendarCog size={12} /> Ajuste só em {fmtDate(dayByKey(s.day).date)}
                </label>
                {s.override != null ? <Stepper value={s.override} min={1} onChange={(v) => updateSlot(s.id, { override: v })} /> : <span className="text-fg-subtle">—</span>}
              </div>
              <SaleRow db={db} slot={s} />
              <div className="mt-2 text-[10px] text-fg-subtle">
                Ocupação atual: {c.taken}/{c.cap} {c.taken > c.cap && <span className="text-rose-400">• acima do novo limite: novas reservas bloqueadas</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
