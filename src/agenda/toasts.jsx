/* Toasts da Agenda e do Painel (topo da tela, somem sozinhos). */
import { useCallback, useState } from 'react'

export function useToasts() {
  const [toasts, setToasts] = useState([])
  const push = useCallback((msg, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])
  return { toasts, push }
}

export function ToastStack({ toasts }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-slideup rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${t.kind === 'err' ? 'bg-rose-600 text-white' : 'bg-inverse text-on-inverse'}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}

