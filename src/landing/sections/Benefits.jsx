// 3. Por que o DS Agende? — faixa de contadores + quatro benefícios diretos
import { BENEFITS, STATS } from '../data'
import { FeatureIcon, Reveal, Section, SectionTitle, useCountUp, useInView } from '../ui'

function Stat({ value, suffix, label, start }) {
  const n = useCountUp(value, start)
  return (
    <div className="px-2 py-5 text-center sm:px-5">
      <p className="font-display text-4xl leading-none text-raiz sm:text-5xl">
        <span className="tabular-nums">{n}</span>
        <span className="text-2xl text-highlight sm:text-3xl">{suffix}</span>
      </p>
      <p className="mx-auto mt-2 max-w-[16ch] text-xs leading-snug text-muted sm:text-sm">{label}</p>
    </div>
  )
}

function StatsBand() {
  const [ref, inView] = useInView({ threshold: 0.4 })
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? 'is-visible' : ''} mb-14 grid grid-cols-2 divide-line rounded-3xl bg-card ring-1 ring-line lg:grid-cols-4 lg:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line lg:[&>*:nth-child(-n+2)]:border-b-0`}
    >
      {STATS.map((s) => (
        <Stat key={s.label} {...s} start={inView} />
      ))}
    </div>
  )
}

export default function Benefits() {
  return (
    <Section id="beneficios">
      <SectionTitle
        kicker="Por que o DS Agende?"
        title="Menos horário vazio, menos mensagem para responder"
        text="Vale para a manicure com agenda de 30 minutos e para o box com turmas de 20 alunos."
      />
      <StatsBand />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map(({ icon, title, text }, i) => (
          <Reveal key={title} delay={i * 90}>
            <article className="group/card h-full rounded-3xl bg-card p-7 ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:ring-ambar hover:shadow-[0_20px_40px_-24px_rgba(71,36,21,.5)]">
              <FeatureIcon icon={icon} />
              <h3 className="mt-6 font-display text-xl leading-snug">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
