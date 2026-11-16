import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Endereço público do site (para a prévia do link no WhatsApp).
// Netlify define URL e a Vercel define VERCEL_PROJECT_PRODUCTION_URL automaticamente no build;
// em outros casos, use SITE_URL=https://seu-dominio npm run build
const siteUrl = (
  process.env.SITE_URL ||
  process.env.URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
).replace(/\/$/, '')

export default defineConfig({
  // GitHub Pages publica em /<repositorio>/ (BASE_PATH vem do workflow); Netlify/Vercel usam a raiz
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl) },
  ],
  server: { port: 5173 },
})
