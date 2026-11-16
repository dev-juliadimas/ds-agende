import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'
import { activeStories, addStory, deleteStory, markStorySeen, storyAge, toast } from '../lib/store'
import { Btn, inputCls } from './ui'

const STORY_MS = 5000
const CAPTION_MAX = 140

export const fmtAge = (min) => (min < 1 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)} h`)
const initials = (name) =>
  name
    .replace('Coach ', '')
    .split(' ')
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// Agrupa por coach, na ordem de publicação (como no Instagram)
function groupByAuthor(list) {
  const map = new Map()
  for (const st of list) map.set(st.author, [...(map.get(st.author) || []), st])
  return [...map.entries()].map(([author, items]) => ({ author, items }))
}

/* Barra de bolinhas no topo da Agenda */
export function StoriesBar({ db }) {
  const groups = groupByAuthor(activeStories(db))
  const [open, setOpen] = useState(null) // índice do grupo
  if (!groups.length) return null
  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-5 pb-1 pt-1 no-scrollbar" aria-label="Stories dos coaches">
        {groups.map((g, i) => {
          const unseen = g.items.some((st) => !db.storiesSeen[st.id])
          return (
            <button key={g.author} onClick={() => setOpen(i)} className="flex w-16 shrink-0 flex-col items-center gap-1" aria-label={`Ver stories de ${g.author}${unseen ? ' (novo)' : ''}`}>
              <span className={`rounded-full p-[2.5px] ${unseen ? 'bg-gradient-to-tr from-copper via-accent to-ambar' : 'bg-line-strong'}`}>
                <span className="block rounded-full bg-canvas p-[2px]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated font-display text-base text-fg">{initials(g.author)}</span>
                </span>
              </span>
              <span className={`w-full truncate text-center text-[10px] ${unseen ? 'font-semibold text-fg' : 'text-fg-subtle'}`}>{g.author.replace('Coach ', '')}</span>
            </button>
          )
        })}
      </div>
      {open != null && <StoryViewer db={db} groups={groups} start={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/* Visualizador em tela cheia: avança sozinho, toque na esquerda/direita para navegar */
export function StoryViewer({ db, groups, start = 0, startIndex = 0, onClose, onDelete }) {
  const [g, setG] = useState(start)
  const [i, setI] = useState(startIndex)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const group = groups[g]
  const st = group?.items[i]

  const next = () => {
    if (i + 1 < group.items.length) setI(i + 1)
    else if (g + 1 < groups.length) (setG(g + 1), setI(0))
    else onClose()
  }
  const prev = () => {
    if (i > 0) setI(i - 1)
    else if (g > 0) (setG(g - 1), setI(groups[g - 1].items.length - 1))
  }

  useEffect(() => {
    if (st) markStorySeen(st.id)
    setProgress(0)
  }, [st?.id])

  useEffect(() => {
    if (paused || !st) return
    const t0 = Date.now() - progress * STORY_MS
    const iv = setInterval(() => {
      const p = (Date.now() - t0) / STORY_MS
      if (p >= 1) {
        clearInterval(iv)
        next()
      } else setProgress(p)
    }, 50)
    return () => clearInterval(iv)
  }, [paused, st?.id])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!st) return null
  return (
    <div className="absolute inset-0 z-[70] flex flex-col bg-ink text-cream" role="dialog" aria-label={`Story de ${group.author}`}>
      {/* barras de progresso */}
      <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
        {group.items.map((x, k) => (
          <div key={x.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-cream/30">
            <div className="h-full bg-cream" style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-3 top-6 z-10 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ambar font-display text-xs text-ink">{initials(group.author)}</span>
        <span className="text-sm font-semibold">{group.author}</span>
        <span className="text-xs text-cream/70">{fmtAge(storyAge(db, st))}</span>
        {onDelete && (
          <button onClick={() => onDelete(st)} className="ml-auto rounded-full p-1.5 hover:bg-cream/10" aria-label="Excluir story">
            <Trash2 size={18} />
          </button>
        )}
        <button onClick={onClose} className={`${onDelete ? '' : 'ml-auto'} rounded-full p-1.5 hover:bg-cream/10`} aria-label="Fechar">
          <X size={20} />
        </button>
      </div>

      {/* mídia */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {st.image ? (
          <img src={st.image} alt={st.caption || `Foto publicada por ${group.author}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-raiz via-[#6b3a22] to-ambar text-8xl" aria-hidden>
            {st.emoji}
          </div>
        )}
        {/* zonas de toque: esquerda volta, direita avança; segurar pausa */}
        <button className="absolute inset-y-0 left-0 w-1/3" aria-label="Story anterior" onClick={prev} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)} />
        <button className="absolute inset-y-0 right-0 w-2/3" aria-label="Próximo story" onClick={next} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)} />
      </div>

      {st.caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/50 to-transparent px-5 pb-8 pt-16">
          <p className="text-[15px] leading-snug">{st.caption}</p>
        </div>
      )}
    </div>
  )
}

// Reduz a foto antes de guardar (celular gera arquivos de vários MB)
function shrinkImage(file, max = 1080) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('Imagem inválida')))
    img.src = url
  })
}

/* Publicação pelo coach: foto + legenda */
export function StoryComposer({ db, author = 'Coach Rafa' }) {
  const [image, setImage] = useState(null)
  const [caption, setCaption] = useState('')
  const [viewing, setViewing] = useState(null)
  const input = useRef(null)
  const mine = activeStories(db)
  const groups = groupByAuthor(mine)

  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) return toast('Escolha uma foto (JPG, PNG ou HEIC convertida).', 'err')
    try {
      setImage(await shrinkImage(f))
    } catch {
      toast('Não foi possível ler esta imagem.', 'err')
    }
  }
  const publish = () => {
    if (!image) return toast('Escolha uma foto para o story.', 'err')
    addStory({ author, caption: caption.trim(), image })
    setImage(null)
    setCaption('')
    toast('Story publicado! Fica visível para os alunos por 24 h.')
  }

  return (
    <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-fg-muted">Stories do box</div>
        <span className="text-[10px] text-fg-subtle">somem após 24 h</span>
      </div>

      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
      {image ? (
        <div className="relative mx-auto aspect-[9/16] w-40 overflow-hidden rounded-2xl ring-1 ring-line">
          <img src={image} alt="Prévia do story" className="h-full w-full object-cover" />
          {caption && <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-2 pt-6 text-[10px] leading-snug text-cream">{caption}</p>}
          <button onClick={() => setImage(null)} className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-cream" aria-label="Remover foto">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line-strong py-6 text-sm font-semibold text-fg-muted transition hover:border-copper hover:text-fg">
          <ImagePlus size={22} className="text-highlight" />
          Escolher foto ou tirar agora
        </button>
      )}

      <div>
        <textarea className={inputCls} rows={2} maxLength={CAPTION_MAX} placeholder="Legenda (ex.: Turma das 6h em peso hoje! 💪)" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <div className="mt-1 text-right text-[10px] text-fg-subtle">
          {caption.length}/{CAPTION_MAX}
        </div>
      </div>
      <Btn className="w-full" disabled={!image} onClick={publish}>
        <ImagePlus size={16} /> Publicar story
      </Btn>

      {mine.length > 0 && (
        <div className="border-t border-line pt-3">
          <div className="mb-2 text-[11px] font-semibold text-fg-muted">No ar agora ({mine.length})</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {mine.map((st) => {
              const gi = groups.findIndex((g) => g.author === st.author)
              return (
                <button
                  key={st.id}
                  onClick={() => setViewing({ g: gi, i: groups[gi].items.findIndex((x) => x.id === st.id) })}
                  className="relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-line"
                  aria-label={`Abrir story de ${st.author}`}
                >
                  {st.image ? <img src={st.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-raiz to-ambar text-2xl">{st.emoji}</span>}
                  <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1 py-0.5 text-[8px] text-cream">{fmtAge(storyAge(db, st))}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {viewing && (
        <StoryViewer
          db={db}
          groups={groups}
          start={viewing.g}
          startIndex={viewing.i}
          onClose={() => setViewing(null)}
          onDelete={(st) => {
            deleteStory(st.id)
            setViewing(null)
            toast('Story excluído.')
          }}
        />
      )}
    </div>
  )
}
