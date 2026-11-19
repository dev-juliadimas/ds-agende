// 6. Dúvidas frequentes — acordeão com abertura suave (uma pergunta aberta por vez)
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { FAQ } from '../data'
import { Reveal, Section, SectionTitle } from '../ui'

function FaqItem({ id, q, a, open, onToggle }) {
  return (
    <div
      className={`rounded-2xl bg-card ring-1 transition duration-300 ${
        open ? 'ring-ambar shadow-[0_18px_36px_-26px_rgba(71,36,21,.6)]' : 'ring-line hover:ring-ambar/60'
      }`}
    >
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={onToggle}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left font-display text-lg leading-snug sm:px-6"
        >
          {q}
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full transition duration-300 ${
              open ? 'rotate-45 bg-ambar text-ink' : 'bg-nevoa-deep text-raiz'
            }`}
            aria-hidden
          >
            <Plus className="size-4" />
          </span>
        </button>
      </h3>
      <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} className="accordion-panel" data-open={open}>
        <div>
          <p className={`px-5 pb-5 text-sm leading-relaxed text-muted transition-opacity duration-300 sm:px-6 sm:text-base ${open ? 'opacity-100' : 'opacity-0'}`}>
            {a}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <Section id="duvidas" className="bg-nevoa-deep">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionTitle
          kicker="Dúvidas frequentes"
          title="Antes de testar, o que todo mundo pergunta"
          text="Ficou alguma outra? Fale com um consultor pelo WhatsApp, no fim da página."
        />
        <div className="space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 80}>
              <FaqItem id={`faq-${i}`} {...item} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  )
}
