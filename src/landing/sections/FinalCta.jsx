// 6. CTA final + rodapé — fundo Raíz Sólida (#472415) com texto claro
import { MessageCircle } from 'lucide-react'
import { BASE, CONSULTOR_URL, DEMO_PATH } from '../data'
import { CtaLink, Kicker, Reveal } from '../ui'

export default function FinalCta() {
  return (
    <footer className="bg-raiz px-4 text-nevoa sm:px-6">
      <Reveal className="mx-auto max-w-3xl py-24 text-center sm:py-32">
        <Kicker className="mb-4 text-ambar">Demonstração interativa</Kicker>
        <h2 className="font-display text-4xl leading-tight sm:text-5xl">Veja a sua agenda funcionando antes de decidir</h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-nevoa/80">
          Agende como cliente, veja o painel de quem atende e converse com o bot. O guia mostra cada função em poucos passos.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          <CtaLink to={DEMO_PATH}>Acessar demonstração</CtaLink>
          <CtaLink href={CONSULTOR_URL} variant="light" icon={MessageCircle} external>
            Falar com consultor
          </CtaLink>
        </div>
      </Reveal>

      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-nevoa/15 py-8 text-sm text-nevoa/75 sm:flex-row">
        <p className="flex items-center gap-2">
          <img src={`${BASE}logo-ds-agende-dark.png`} alt="" className="h-6 w-auto" />
          <span className="font-display text-base text-nevoa">DS Agende</span>
        </p>
        <p>
          Desenvolvido por <span className="font-semibold text-nevoa">Double S Tech</span>
        </p>
      </div>
    </footer>
  )
}
