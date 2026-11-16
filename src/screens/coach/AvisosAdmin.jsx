import { useState } from 'react'
import { MessageCircle, Pin, PinOff, Send, Trash2 } from 'lucide-react'
import { DAYS, dayByKey } from '../../lib/constants'
import { addNotice, deleteNotice, dispatchUrgent, toast, togglePin } from '../../lib/store'
import { Btn, Field, inputCls } from '../../components/ui'
import { CATS, NoticeCard } from '../Avisos'
import { StoryComposer } from '../../components/Stories'
import { BirthdaysCard } from '../../components/Birthdays'

export default function AvisosAdmin({ db }) {
  const empty = { title: '', body: '', category: 'geral', pinned: false, urgent: false, day: db.now.day }
  const [f, setF] = useState(empty)
  const up = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const publish = () => {
    if (!f.title) return toast('Informe o título do aviso', 'err')
    const n = addNotice({ title: f.title, body: f.body, category: f.category, pinned: f.pinned, author: 'Coach Rafa' })
    if (f.urgent) {
      const k = dispatchUrgent(n.id, f.day)
      toast(`Aviso publicado e enviado no WhatsApp para ${k} alunos de ${dayByKey(f.day).label}`)
    } else toast('Aviso publicado no mural')
    setF(empty)
  }
  const list = [...db.notices].sort((a, b) => b.pinned - a.pinned || b.date.localeCompare(a.date))
  return (
    <div className="space-y-4">
      <StoryComposer db={db} />
      <BirthdaysCard db={db} compact />
      <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="text-xs font-bold uppercase tracking-wider text-fg-muted">Novo comunicado</div>
        <input className={inputCls} placeholder="Título (ex.: Aula das 18:30 cancelada hoje)" value={f.title} onChange={up('title')} />
        <textarea className={inputCls} rows={3} placeholder="Mensagem" value={f.body} onChange={up('body')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Categoria">
            <select className={inputCls} value={f.category} onChange={up('category')}>
              {Object.entries(CATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-3 text-sm">
            <input type="checkbox" checked={f.pinned} onChange={up('pinned')} className="accent-accent" /> Fixar no topo
          </label>
        </div>
        <div className="rounded-xl bg-rose-500/5 p-3 ring-1 ring-rose-500/20">
          <label className="flex items-center gap-2 text-sm text-rose-200">
            <input type="checkbox" checked={f.urgent} onChange={up('urgent')} className="accent-rose-400" />
            🚨 Alerta urgente via WhatsApp
          </label>
          {f.urgent && (
            <div className="mt-2">
              <Field label="Enviar para inscritos de" hint="Somente alunos com reserva no dia afetado recebem a mensagem.">
                <select className={inputCls} value={f.day} onChange={up('day')}>
                  {DAYS.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label} ({d.date.slice(8)}/{d.date.slice(5, 7)})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
        <Btn className="w-full" onClick={publish}>
          <Send size={16} /> Publicar{f.urgent ? ' + disparar WhatsApp' : ''}
        </Btn>
      </div>

      <div className="space-y-3">
        {list.map((n) => (
          <NoticeCard
            key={n.id}
            n={n}
            actions={
              <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                <Btn variant="dark" className="px-3 py-1.5 text-xs" onClick={() => togglePin(n.id)}>
                  {n.pinned ? <PinOff size={13} /> : <Pin size={13} />} {n.pinned ? 'Desafixar' : 'Fixar'}
                </Btn>
                <Btn
                  variant="dark"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => {
                    const k = dispatchUrgent(n.id, db.now.day)
                    toast(`Enviado para ${k} alunos inscritos hoje`)
                  }}
                >
                  <MessageCircle size={13} /> WhatsApp hoje
                </Btn>
                <Btn variant="ghost" className="ml-auto px-2 py-1.5 text-xs" onClick={() => deleteNotice(n.id)} aria-label="Excluir">
                  <Trash2 size={14} />
                </Btn>
              </div>
            }
          />
        ))}
      </div>
    </div>
  )
}
