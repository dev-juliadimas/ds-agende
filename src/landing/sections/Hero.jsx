// 1. Hero: headline + CTAs à esquerda; à direita um celular com o lembrete das 20h que o visitante pode testar.
import { useEffect, useRef, useState } from 'react'
import { BellRing, Check, CheckCheck, ListOrdered, MessageCircle, RotateCcw, Undo2, Users } from 'lucide-react'
import { BASE, CONSULTOR_URL, DEMO_PATH } from '../data'
import { CtaLink, Reveal } from '../ui'

// Valor que "pula" quando muda (a key nova reinicia a animação)
const Pop = ({ children }) => (
  <span key={String(children)} className="animate-pop inline-block">
    {children}
  </span>
)

function TypingBubble() {
  return (
    <div className="animate-bubble flex w-fit items-center gap-1 rounded-2xl rounded-tl-md bg-white px-3.5 py-3 shadow-sm" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot size-1.5 rounded-full bg-muted" />
      ))}
    </div>
  )
}

/*
 * Micro-experiência: o lembrete da véspera com "Confirmar presença" e "Liberar vaga".
 * phase: idle → typing → done (→ queue, só ao liberar: a fila é avisada logo depois)
 */
function ReminderDemo() {
  const [choice, setChoice] = useState(null) // 'confirm' | 'release'
  const [phase, setPhase] = useState('idle')
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  const answer = (c) => {
    if (phase !== 'idle') return
    setChoice(c)
    setPhase('typing')
    later(() => setPhase('done'), 750)
    if (c === 'release') later(() => setPhase('queue'), 1900)
  }

  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setChoice(null)
    setPhase('idle')
  }

  const answered = phase === 'done' || phase === 'queue'
  const confirmed = 4 + (choice === 'confirm' && answered ? 1 : 0)
  const queue = 2 - (phase === 'queue' ? 1 : 0)

  const status = !answered
    ? ''
    : choice === 'confirm'
      ? 'Vaga confirmada! Mais uma presença na agenda.'
      : phase === 'queue'
        ? 'Vaga liberada. Carla, a primeira da fila de espera, ficou com o horário.'
        : 'Vaga liberada para a fila de espera!'

  return (
    <div className="relative mx-auto w-full max-w-[310px]">
      {/* luz âmbar suave atrás do aparelho */}
      <div className="absolute -right-12 -top-12 size-72 rounded-full bg-ambar/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-10 -left-16 size-56 rounded-full bg-raiz/10 blur-3xl" aria-hidden />

      <p className="relative mb-4 flex items-center justify-center gap-2 text-xs font-semibold text-highlight">
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ambar opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-ambar" />
        </span>
        Experimente: toque em um dos botões
      </p>

      <div className="relative rounded-[2.6rem] bg-raiz p-2.5 shadow-[0_40px_80px_-30px_rgba(71,36,21,.55)]">
        <div className="relative flex h-[540px] flex-col overflow-hidden rounded-[2.1rem] bg-nevoa-deep">
          {/* barra do app de mensagens */}
          <div className="flex items-center gap-2.5 bg-raiz px-4 pb-3 pt-7 text-nevoa">
            <span className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-ink/70" aria-hidden />
            <img src={`${BASE}logo-ds-agende-dark.png`} alt="" className="size-8 rounded-full bg-nevoa/10 object-contain p-1" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">DS Agende</p>
              <p className="flex items-center gap-1 text-[10px] text-nevoa/70">
                <span className="size-1.5 rounded-full bg-wa" aria-hidden /> Bot oficial do WhatsApp
              </p>
            </div>
          </div>

          {/* resumo da agenda: muda conforme a resposta */}
          <div className="grid grid-cols-2 gap-2 border-b border-line bg-card/80 px-3 py-2.5 text-[11px]">
            <div className="flex items-center gap-1.5 rounded-lg bg-nevoa-deep px-2 py-1.5">
              <Users className="size-3.5 text-highlight" aria-hidden />
              <span className="text-muted">Confirmados</span>
              <b className="ml-auto font-display text-sm text-raiz">
                <Pop>{confirmed}</Pop>/6
              </b>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-nevoa-deep px-2 py-1.5">
              <ListOrdered className="size-3.5 text-highlight" aria-hidden />
              <span className="text-muted">Fila</span>
              <b className="ml-auto font-display text-sm text-raiz">
                <Pop>{queue}</Pop>
              </b>
            </div>
          </div>

          {/* conversa */}
          {/* justify-end: como num app de mensagens, a última mensagem fica sempre visível */}
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden px-3 py-4" aria-label="Conversa simulada">
            <p className="mx-auto rounded-full bg-card/80 px-2.5 py-0.5 text-[10px] text-muted">Hoje, 20:00</p>

            <div className="animate-bubble max-w-[88%] rounded-2xl rounded-tl-md bg-white p-3 text-[13px] leading-snug shadow-sm">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-highlight">
                <BellRing className="size-3" aria-hidden /> Lembrete
              </p>
              Oi, Ana! Amanhã às <b>09:00</b> tem seu horário de <b>Alongamento em gel</b>. Você vem?
              <span className="mt-1 block text-right text-[10px] text-muted">20:00</span>
            </div>

            {phase === 'idle' && (
              <div className="grid max-w-[88%] gap-1.5">
                <button
                  type="button"
                  onClick={() => answer('confirm')}
                  className="animate-halo flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-raiz px-3 text-[13px] font-semibold text-nevoa transition duration-300 hover:-translate-y-px hover:bg-raiz/90 active:scale-[.97]"
                >
                  <Check className="size-4 text-ambar" aria-hidden /> Confirmar presença
                </button>
                <button
                  type="button"
                  onClick={() => answer('release')}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-[13px] font-semibold text-raiz ring-1 ring-line transition duration-300 hover:-translate-y-px hover:ring-ambar active:scale-[.97]"
                >
                  <Undo2 className="size-4 text-highlight" aria-hidden /> Liberar vaga
                </button>
              </div>
            )}

            {choice && (
              <div className="animate-bubble ml-auto max-w-[80%] rounded-2xl rounded-tr-md bg-ambar/25 px-3 py-2 text-[13px] font-semibold text-raiz shadow-sm">
                {choice === 'confirm' ? 'Confirmar presença' : 'Liberar vaga'}
                <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-normal text-muted">
                  20:01 <CheckCheck className="size-3 text-highlight" aria-hidden />
                </span>
              </div>
            )}

            {phase === 'typing' && <TypingBubble />}

            {answered && (
              <div className="animate-bubble max-w-[88%] rounded-2xl rounded-tl-md bg-white p-3 text-[13px] leading-snug shadow-sm">
                {choice === 'confirm' ? (
                  <>
                    <b>Vaga confirmada!</b> Te esperamos amanhã às 09:00. ✨
                  </>
                ) : (
                  <>
                    Tudo bem, Ana! <b>Vaga liberada para a fila de espera.</b> Obrigada por avisar.
                  </>
                )}
              </div>
            )}

            {phase === 'queue' && (
              <p className="animate-bubble mx-auto flex items-center gap-1.5 rounded-full bg-raiz px-3 py-1 text-[11px] text-nevoa">
                <ListOrdered className="size-3 text-ambar" aria-hidden /> Carla, 1ª da fila, ficou com o horário
              </p>
            )}
          </div>

          {/* feedback: toast elegante no rodapé da tela */}
          <div
            className={`mx-3 mb-3 flex items-center gap-2.5 rounded-2xl bg-card p-3 shadow-[0_12px_30px_-14px_rgba(71,36,21,.55)] ring-1 ring-ambar/60 transition duration-500 ${
              answered ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
            }`}
            aria-hidden={!answered}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ambar text-ink">
              {choice === 'release' ? <ListOrdered className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
            </span>
            <p className="min-w-0 flex-1 text-[12px] leading-tight">
              <b className="block font-display text-[13px]">
                {choice === 'release' ? 'Vaga liberada para a fila!' : 'Vaga confirmada! +1 na agenda'}
              </b>
              <span className="text-muted">
                {choice === 'release' ? 'Ninguém fica com horário vazio.' : 'Sem você mandar mensagem.'}
              </span>
            </p>
            <button
              type="button"
              onClick={reset}
              tabIndex={answered ? 0 : -1}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-nevoa-deep hover:text-raiz"
              aria-label="Testar de novo"
              title="Testar de novo"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* anúncio para leitores de tela */}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  )
}

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      {/* textura sutil de fundo */}
      <div
        className="pointer-events-none absolute inset-0 -z-0 opacity-[.35] [background-image:radial-gradient(rgba(71,36,21,.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <Reveal>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-card/80 px-3.5 py-1.5 text-xs text-muted backdrop-blur">
              <span className="size-1.5 rounded-full bg-ambar" aria-hidden />
              Para profissionais da beleza, estética, boxes e estúdios
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-[2.1rem] leading-[1.1] sm:text-5xl lg:text-[3.3rem]">
              Sua agenda cheia, sem furos e automatizada{' '}
              <span className="relative whitespace-nowrap text-highlight">
                pelo WhatsApp
                <svg viewBox="0 0 200 12" className="absolute -bottom-2 left-0 h-2.5 w-full text-ambar/70" preserveAspectRatio="none" aria-hidden>
                  <path d="M2 9 C 50 2, 120 2, 198 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 font-display text-xl leading-snug text-raiz/85 sm:text-2xl">
              Para atendimentos individuais ou aulas em grupo.
            </p>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Um site que o cliente abre pelo link, sem baixar aplicativo, e um bot de WhatsApp que agenda, lembra e cobra.
              Os dois ficam 100% sincronizados: o que muda em um aparece no outro na hora.
            </p>
          </Reveal>

          <Reveal delay={240} className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <CtaLink to={DEMO_PATH}>Acessar demonstração</CtaLink>
            <CtaLink href={CONSULTOR_URL} variant="outline" icon={MessageCircle} external>
              Falar com consultor
            </CtaLink>
          </Reveal>

          <Reveal as="ul" delay={320} className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {['Sem baixar app', 'Lembrete automático na véspera', 'Sinal via Pix'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-ambar" aria-hidden /> {t}
              </li>
            ))}
          </Reveal>
        </div>

        <Reveal delay={200}>
          <ReminderDemo />
        </Reveal>
      </div>
    </section>
  )
}
