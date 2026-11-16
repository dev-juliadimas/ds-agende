import { useEffect, useRef, useState } from 'react'
import { AlarmClock, ArrowLeft, CheckCheck, MoreVertical, Phone, Send, Video } from 'lucide-react'
import { handleInput } from '../lib/bot'
import { sendReminders } from '../lib/store'
import { BOX } from '../lib/constants'

function fmt(text) {
  // *negrito*, _itálico_, `mono` no estilo WhatsApp
  const parts = text.split(/(\*[^*]+\*|_[^_]+_|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <b key={i}>{p.slice(1, -1)}</b>
    if (/^_[^_]+_$/.test(p)) return <i key={i}>{p.slice(1, -1)}</i>
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="break-all rounded bg-black/5 px-1 font-mono text-[10px]">{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

export default function WhatsApp({ db }) {
  const [chat, setChat] = useState('me')
  const [text, setText] = useState('')
  const end = useRef(null)
  const c = db.chats[chat]
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [c.messages.length, chat])
  const lastBotIdx = c.messages.map((m) => m.from).lastIndexOf('bot')
  const send = (v, label) => {
    if (!v.trim()) return
    handleInput(chat, v, label)
    setText('')
  }
  return (
    <div className="flex h-full flex-col bg-wa-bg text-zinc-900">
      <div className="bg-wa pt-9 text-white">
        <div className="flex items-center gap-2 px-2 pb-2">
          <ArrowLeft size={20} />
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm font-extrabold text-volt">DS</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{BOX.name}</div>
            <div className="text-[11px] text-white/70">Conta comercial • online</div>
          </div>
          <Video size={18} className="opacity-80" />
          <Phone size={16} className="opacity-80" />
          <MoreVertical size={18} className="opacity-80" />
        </div>
        <div className="flex gap-1 px-2 pb-2">
          {[
            ['me', 'Marina (aluna)'],
            ['visitor', 'Visitante novo'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setChat(k)} className={`flex-1 rounded-full py-1 text-[11px] font-semibold ${chat === k ? 'bg-white text-wa' : 'bg-white/10 text-white/80'}`}>
              Falando como: {l}
            </button>
          ))}
        </div>
      </div>

      <div className="wa-pattern flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3 scroll-thin">
        <div className="mx-auto w-fit rounded-lg bg-[#fff5c4] px-3 py-1 text-center text-[10px] text-zinc-600 shadow-sm">🔒 Atendimento automático 24h sincronizado com o DS Agende</div>
        {!c.messages.length && (
          <div className="mx-auto mt-4 max-w-[240px] rounded-xl bg-white/80 p-3 text-center text-[11px] text-zinc-600 shadow-sm">
            Mande um <b>“oi”</b> para começar. Reservas e cancelamentos feitos aqui aparecem na hora na grade do app.
          </div>
        )}
        {c.messages.map((m, idx) => (
          <div key={m.id} className={`flex flex-col ${m.from === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`relative max-w-[85%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug shadow-sm ${m.from === 'user' ? 'rounded-tr-none bg-wa-bubble' : 'rounded-tl-none bg-white'}`}>
              {fmt(m.text)}
              <span className="ml-2 inline-flex translate-y-1 items-center gap-0.5 float-right text-[9px] text-zinc-500">
                {m.time} {m.from === 'user' && <CheckCheck size={12} className="text-sky-500" />}
              </span>
            </div>
            {m.buttons?.length > 0 && (
              <div className={`mt-1 grid w-[85%] gap-1 ${m.buttons.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {m.buttons.map((b) => (
                  <button
                    key={b.value}
                    disabled={idx < lastBotIdx - 3}
                    onClick={() => send(b.value, b.label)}
                    className="rounded-lg bg-white py-1.5 text-[11.5px] font-semibold text-sky-600 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>

      {chat === 'me' && (
        <div className="flex gap-1 overflow-x-auto bg-wa-bg px-2 pt-1.5 no-scrollbar">
          <button onClick={() => sendReminders()} className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-300">
            <AlarmClock size={11} /> Simular lembrete {db.settings.reminderTime}
          </button>
          {['menu', '2', '3'].map((q) => (
            <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 ring-1 ring-zinc-300">
              {q === 'menu' ? 'menu' : q === '2' ? 'reservar' : 'minhas reservas'}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-1.5 bg-wa-bg px-2 pb-4 pt-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem" className="min-w-0 flex-1 rounded-full bg-white px-4 py-2 text-sm outline-none" />
        <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wa text-white" aria-label="Enviar">
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
