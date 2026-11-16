import { useEffect, useState } from 'react'

// O tema inicial já é aplicado no index.html (antes da 1ª pintura) para não "piscar".
const KEY = 'ds-agende-theme'
const COLORS = { light: '#faf6f0', dark: '#180f0a' }

function saved() {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme])
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || saved() || systemTheme())

  useEffect(() => {
    apply(theme)
  }, [theme])

  // Sem escolha salva, acompanha a mudança do sistema (ex.: modo noturno automático do celular)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      if (!saved()) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = () =>
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(KEY, next)
      } catch {
        /* navegação privada: vale só nesta sessão */
      }
      return next
    })

  return { theme, toggle }
}
