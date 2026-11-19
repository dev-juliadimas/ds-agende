// Cabeçalho fixo em vidro fosco: transparente no topo; ao rolar ganha fundo, borda e sombra suaves.
// No celular o menu abre em gaveta.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { BASE, DEMO_PATH, NAV } from '../data'
import { CtaLink } from '../ui'

function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])
  return scrolled
}

export default function Header() {
  const [open, setOpen] = useState(false)
  const scrolled = useScrolled()
  const solid = scrolled || open

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-500 ${
        solid
          ? 'border-line/80 bg-nevoa/75 shadow-[0_10px_30px_-20px_rgba(71,36,21,.45)]'
          : 'border-transparent bg-nevoa/0'
      }`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 transition-[height] duration-500 sm:px-6 ${
          scrolled ? 'h-14' : 'h-16 sm:h-[4.5rem]'
        }`}
      >
        <a href="#topo" className="group flex items-center gap-2.5" aria-label="DS Agende, voltar ao topo">
          <img
            src={`${BASE}logo-ds-agende.png`}
            alt=""
            className="h-8 w-auto transition duration-500 group-hover:rotate-[-8deg]"
          />
          <span className="font-display text-xl">DS Agende</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Seções">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="relative py-1 text-sm text-muted transition hover:text-raiz after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-ambar after:transition-transform after:duration-300 hover:after:scale-x-100"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to={DEMO_PATH}
            className="hidden rounded-full bg-raiz px-5 py-2 text-sm font-semibold text-nevoa transition duration-300 hover:-translate-y-px hover:bg-raiz/90 hover:shadow-[0_8px_20px_-10px_rgba(71,36,21,.8)] sm:inline-block"
          >
            Ver demonstração
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-full border border-line bg-card/60 md:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="menu-mobile" className="animate-swap border-t border-line px-4 pb-5 md:hidden" aria-label="Seções">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-line py-3 text-muted">
              {n.label}
            </a>
          ))}
          <CtaLink to={DEMO_PATH} className="mt-5 w-full">Acessar demonstração</CtaLink>
        </nav>
      )}
    </header>
  )
}
