// 2. Feito para o seu formato de atendimento
// Seletor em pílula (Profissionais | Turmas) e um painel que troca com transição suave.
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEMO_PATH, FORMATS } from '../data'
import { FeatureIcon, Kicker, PillToggle, Reveal, Section, SectionTitle } from '../ui'

function FormatPanel({ format }) {
  const BigIcon = format.icon
  return (
    // key = formato: ao trocar de aba o painel remonta e a animação .animate-swap roda de novo
    <div key={format.key} className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
      <div className="animate-swap flex flex-col">
        <span className="mb-6 grid size-14 place-items-center rounded-2xl bg-raiz text-ambar shadow-[0_12px_24px_-14px_rgba(71,36,21,.9)]">
          <BigIcon className="size-7" strokeWidth={1.6} aria-hidden />
        </span>
        <Kicker>{format.label}</Kicker>
        <h3 className="font-display text-2xl leading-snug sm:text-[1.9rem]">{format.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">{format.audience}</p>
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Exemplos">
          {format.chips.map((c, i) => (
            <li
              key={c}
              className="animate-swap rounded-full bg-nevoa-deep px-3 py-1 text-xs font-semibold text-raiz ring-1 ring-line"
              style={{ animationDelay: `${120 + i * 40}ms` }}
            >
              {c}
            </li>
          ))}
        </ul>
        <Link
          to={DEMO_PATH}
          className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-highlight transition hover:text-raiz"
        >
          Ver esse formato na demonstração
          <ArrowRight className="size-4 transition duration-300 group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {format.items.map(({ icon, title, text }, i) => (
          <li
            key={title}
            className="group/card animate-swap rounded-2xl bg-nevoa-deep/70 p-5 ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:bg-card hover:ring-ambar hover:shadow-[0_16px_32px_-20px_rgba(71,36,21,.5)]"
            style={{ animationDelay: `${80 + i * 70}ms` }}
          >
            <FeatureIcon icon={icon} size="sm" />
            <p className="mt-4 font-semibold">{title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Formats() {
  const [active, setActive] = useState(FORMATS[0].key)
  const format = FORMATS.find((f) => f.key === active)

  return (
    <Section id="formatos" className="bg-nevoa-deep">
      <SectionTitle
        kicker="Feito para o seu formato"
        title="Atende uma cliente por vez ou uma turma inteira?"
        text="O DS Agende funciona nos dois modelos. Escolha o seu e veja como a agenda se ajusta."
        center
      />

      <Reveal className="mx-auto mb-8 max-w-md">
        <PillToggle
          label="Formato de atendimento"
          idPrefix="aba-formato"
          controls="painel-formato"
          value={active}
          onChange={setActive}
          options={FORMATS.map((f) => ({ key: f.key, label: f.tab, hint: f.tabHint, icon: f.icon }))}
        />
      </Reveal>

      <Reveal>
        <article
          id="painel-formato"
          role="tabpanel"
          aria-labelledby={`aba-formato-${active}`}
          className="rounded-[2rem] bg-card p-6 ring-1 ring-line shadow-[0_30px_60px_-40px_rgba(71,36,21,.5)] sm:p-10"
        >
          <FormatPanel format={format} />
        </article>
      </Reveal>
    </Section>
  )
}
