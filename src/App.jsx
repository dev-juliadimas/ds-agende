/*
 * Rotas do site DS Agende
 *   /       Landing Page (apresentação para o dono do box)  → src/landing/LandingPage.jsx
 *   /demo   Demonstração interativa (protótipo do app)      → src/Demo.jsx
 *   /clientes/:slug  Página de um cliente (box, modalidades, horários, planos) → src/landing/client/ClientPage.jsx
 * Qualquer outro endereço volta para a apresentação.
 *
 * Cada página é carregada só quando é aberta (lazy): quem vê a landing não baixa o código da demo.
 */
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))
const Demo = lazy(() => import('./Demo.jsx'))
const ClientPage = lazy(() => import('./landing/client/ClientPage.jsx'))

const TITLES = {
  '/': 'DS Agende • Agenda sem furos, automatizada pelo WhatsApp',
  '/demo': 'DS Agende • Demonstração interativa',
}

// Título da aba e topo da página a cada troca de rota
function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    // a página do cliente define o próprio título
    if (!pathname.startsWith('/clientes/')) document.title = TITLES[pathname] || TITLES['/']
    // 'instant': a landing liga scroll-behavior: smooth, e a animação deixaria a página nova no meio
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export default function App() {
  return (
    // basename: no GitHub Pages o site fica em /<repositorio>/
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <RouteEffects />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/clientes/:slug" element={<ClientPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
