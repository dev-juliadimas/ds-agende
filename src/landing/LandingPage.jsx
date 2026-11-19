/*
 * DS Agende — Landing Page de vendas (profissionais com atendimento individual e espaços com turmas).
 * Objetivo único: levar o gestor até a demonstração interativa.
 * Visual "Tech Suave" da Double S Tech: névoa clara, marrom Raíz Sólida (#472415) e âmbar (#BF9055).
 *
 * É a rota / do site (ver src/App.jsx); a demonstração fica em /demo.
 * Google Fonts (Tenor Sans para títulos, Arimo para textos): o <link> fica no <head> do
 * index.html. As famílias e as cores são ligadas ao Tailwind no @theme de ./landing.css,
 * por isso os componentes usam classes como font-display, bg-raiz, text-ambar e bg-nevoa.
 *
 * Organização da pasta:
 *   data.js       links, textos dos cards e clientes (é aqui que se troca conteúdo)
 *   ui.jsx        peças reutilizáveis (botão, ícone em destaque, título e moldura de seção)
 *   sections/     uma seção por arquivo, na ordem da página
 *   LandingPage   monta as seções
 *
 * Interações: navbar em vidro fosco, lembrete clicável no Hero, abas em pílula, Bento Grid,
 * entrada ao rolar (IntersectionObserver, sem biblioteca), contadores, filtro de clientes e FAQ.
 */
import Header from './sections/Header'
import Hero from './sections/Hero'
import Formats from './sections/Formats'
import Benefits from './sections/Benefits'
import Features from './sections/Features'
import Clients from './sections/Clients'
import Faq from './sections/Faq'
import FinalCta from './sections/FinalCta'

export default function LandingPage() {
  return (
    // overflow-x-clip (e não hidden): "hidden" vira contêiner de rolagem e quebra o cabeçalho sticky
    <div className="landing-root min-h-screen overflow-x-clip bg-nevoa text-raiz">
      <a
        href="#formatos"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-raiz focus:px-4 focus:py-2 focus:text-nevoa"
      >
        Pular para o conteúdo
      </a>
      <Header />
      <main>
        <Hero />
        <Formats />
        <Benefits />
        <Features />
        <Clients />
        <Faq />
      </main>
      <FinalCta />
    </div>
  )
}
