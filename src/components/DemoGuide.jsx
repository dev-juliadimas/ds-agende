/*
 * Guia de Testes (modo apresentação comercial).
 * Cada função mostra o valor para o box, o passo a passo dentro do protótipo
 * e um botão que leva direto para a tela certa.
 */
import { useState } from 'react'
import { ArrowRight, ChevronDown, Target, X } from 'lucide-react'

export const GUIDE = [
  {
    id: 1,
    title: 'Agendamento recorrente e filtro por nível',
    value: 'O aluno reserva o horário fixo uma vez e a vaga renova sozinha toda semana enquanto ele estiver em dia. Os filtros por nível evitam iniciante em turma RX e reduzem a fila no balcão.',
    steps: [
      'Na aba Agenda, toque nos dias e nos filtros de nível (Iniciante, Scaled, RX) para ver a grade mudar.',
      'Cada aula mostra lotação em tempo real (ex.: 8/12), coach e WOD do dia.',
      'Toque em “Reserva fixa” nas ações rápidas → escolha Seg/Qua/Sex às 06:00 → confirme.',
      'As aulas aparecem como “✓ Inscrito” na grade e também em “Minhas reservas” no WhatsApp.',
    ],
    go: { tab: 'agenda' },
    cta: 'Ir para Agenda',
  },
  {
    id: 2,
    title: 'Aula experimental com acompanhante e PAR-Q',
    value: 'Visitante agenda em 1 minuto, sem ligar para o box. O coach recebe a ficha de saúde em destaque antes da aula, e o box controla quantos experimentais cabem por turma.',
    steps: [
      'Na Agenda, toque em “Aula experimental”.',
      'Preencha nome e WhatsApp e escolha um horário Iniciante ou Todos os Níveis.',
      'Marque “Vou com meu esposo(a) / acompanhante” e informe o nome.',
      'Na mini ficha PAR-Q, marque uma lesão (ex.: dor no joelho) e agende.',
      'Vá em Coach/Gestão → Turmas → abra o mesmo horário: a ficha aparece em destaque para o coach.',
    ],
    go: { tab: 'agenda' },
    cta: 'Ir para Agenda',
  },
  {
    id: 3,
    title: 'Agendamento pelo bot do WhatsApp em tempo real',
    value: 'O aluno resolve tudo pelo WhatsApp, 24h, sem a recepção digitar nada. O bot usa as mesmas regras e o mesmo banco do site: não existe vaga duplicada.',
    steps: [
      'No celular do WhatsApp (ao lado do app; no celular, aba “WhatsApp” no topo), digite “oi”.',
      'Toque em “Reservar aula” → QUI → 06:00.',
      'Veja a grade do app atualizar na hora e o evento aparecer no painel “Supabase Realtime”.',
      'Teste também “Minhas reservas” → cancelar, e “Visitante novo” → aula experimental ou drop-in.',
    ],
    go: { tab: 'agenda', pane: 'wa' },
    cta: 'Abrir WhatsApp',
  },
  {
    id: 4,
    title: 'Lista de espera automática',
    value: 'Turma lotada não perde aluno: quem desiste libera a vaga e o próximo da fila entra sozinho e é avisado no WhatsApp para confirmar ou liberar com um toque.',
    steps: [
      'Na Agenda, escolha QUI e toque na aula das 18:30 (lotada) → “Entrar na lista de espera”.',
      'Vá em Coach/Gestão → Turmas → QUI → 18:30.',
      'Na lista de chamada, toque em ➖ em qualquer aluno (“aluno avisou”).',
      'A vaga passa para a Marina na hora e chega no WhatsApp a mensagem com “Estarei lá” / “Liberar vaga”.',
    ],
    go: { tab: 'agenda' },
    cta: 'Ir para Agenda',
  },
  {
    id: 5,
    title: 'Pagamento (Pix, Cartão, Recepção) e bloqueio por carência',
    value: 'O aluno paga pelo celular ou no balcão, o box enxerga quem está em dia, em carência ou bloqueado, e o acesso é suspenso sozinho, sem constrangimento na recepção.',
    steps: [
      'Aba Planos: a Marina está “Em carência” (venceu 11/11, carência de 3 dias). Ela continua treinando e vê o aviso na Agenda.',
      'Toque em “Pagar agora” → Pix → “Simular Pix pago”. Situação vira “Em dia” e o recibo chega no WhatsApp.',
      'Bloqueio: ative uma reserva fixa na Agenda, volte em Planos e toque em “🔒 Bloqueado” (demo). As reservas futuras são liberadas e a Agenda passa a recusar reservas.',
      'Pague de novo e veja a reserva fixa voltar sozinha.',
      'Recepção: pague escolhendo “Pagar na recepção” e dê baixa em Coach/Gestão → Financeiro (Dinheiro ou Maquininha).',
      'Pré-reserva de 15 min: Agenda → Drop-in → escolha horário → Pix. Veja o contador e toque em “Simular 15 min sem pagar”: a vaga volta para a grade.',
    ],
    go: { tab: 'planos' },
    cta: 'Ir para Planos',
  },
  {
    id: 6,
    title: 'Check-in por QR Code e desbloqueio de selos',
    value: 'Presença real, sem lista de papel: o QR muda a cada 30 s e só vale na aula, então ninguém marca presença de casa. Os selos viram motivo para o aluno voltar e divulgar o box.',
    steps: [
      'O relógio da demo está em Quinta 05:50. Na Agenda, reserve QUI 06:00.',
      'Coach/Gestão → Turmas → QUI 06:00 → “Exibir QR da turma”. Feche a tela do QR.',
      'Agenda → no cartão do próximo treino, toque em “Sem GPS? QR” → “Simular leitura do QR”.',
      'O selo 🏅 Primeiro WOD é desbloqueado com o card para os Stories do Instagram, e o aviso chega no WhatsApp.',
      'Alternativas: botão “Estou aqui” (GPS, 50 m e 15 min) ou o coach marcar presença com um toque na chamada.',
      'Em Conquistas, veja todos os selos e o ranking mensal de assiduidade.',
    ],
    go: { tab: 'agenda' },
    cta: 'Ir para Agenda',
  },
  {
    id: 7,
    title: 'Vagas por aula e dashboard de faltas (no-show)',
    value: 'O box ajusta a lotação de cada horário (e de um dia específico com pouco equipamento) e passa a medir quem reserva e não aparece, por dia, horário e coach.',
    steps: [
      'Coach/Gestão → Capacidade: mude o limite de um horário (ex.: 06:00 para 16), a cota de experimentais e o ajuste só desta data.',
      'Coach/Gestão → Turmas → escolha uma aula → “Encerrar aula”.',
      'Coach/Gestão → Métricas → filtro “Hoje”: cada reserva aparece como Presente, Cancelado no prazo ou Falta sem aviso.',
      'Veja taxa de assiduidade por dia, horário e coach, o funil de experimentais e o histórico individual. Dá para exportar em CSV.',
    ],
    go: { tab: 'coach', coachTab: 'cap' },
    cta: 'Ir para Capacidade',
  },
  {
    id: 8,
    title: 'Lista de alunos sumidos e controle de custos Meta',
    value: 'O box recupera aluno antes de ele cancelar o plano, e decide quanto quer gastar com a API oficial: cada disparo automático liga ou desliga, ou o coach chama pelo próprio WhatsApp sem custo.',
    steps: [
      'Coach/Gestão → Métricas → “Alunos sumidos”: alunos com 2+ faltas seguidas ou 7+ dias sem check-in.',
      'Toque em “Chamar” → “Abrir no meu WhatsApp” (grátis) ou “Enviar pelo bot oficial” (custo Meta).',
      'Coach/Gestão → Bot & Custos: desligue “Lembrete anti-falta” e veja a estimativa mensal cair.',
      'No WhatsApp, toque em “Simular lembrete 20:00”: com o disparo desligado, nada é enviado.',
    ],
    go: { tab: 'coach', coachTab: 'bot' },
    cta: 'Ir para Bot & Custos',
  },
]

export function GuideButton({ onClick, className = '' }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-ink shadow hover:bg-accent-strong ${className}`}>
      <Target size={14} /> Guia de Testes (Demo)
    </button>
  )
}

export default function DemoGuide({ open, onClose, onGo }) {
  const [sel, setSel] = useState(1)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="animate-slideup flex h-full w-full max-w-[440px] flex-col bg-surface text-fg shadow-2xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
        aria-label="Guia de Testes"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.25em] text-highlight">Modo demonstração</div>
            <h2 className="font-display text-2xl font-extrabold uppercase">🎯 Funções & como testar</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-card p-2 text-fg-muted hover:text-fg" aria-label="Fechar guia">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4 scroll-thin">
          {GUIDE.map((g) => {
            const on = sel === g.id
            return (
              <div key={g.id} className={`overflow-hidden rounded-2xl ring-1 ${on ? 'bg-card ring-accent/60' : 'bg-card/60 ring-line'}`}>
                <button onClick={() => setSel(on ? null : g.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={on}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold ${on ? 'bg-accent text-ink' : 'bg-elevated text-fg-muted'}`}>{g.id}</span>
                  <span className="flex-1 text-sm font-bold leading-snug">{g.title}</span>
                  <ChevronDown size={16} className={`shrink-0 text-fg-subtle transition ${on ? 'rotate-180' : ''}`} />
                </button>
                {on && (
                  <div className="space-y-3 px-4 pb-4">
                    <div className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-fg-soft ring-1 ring-accent/30">
                      <b className="text-highlight">O que resolve:</b> {g.value}
                    </div>
                    <ol className="space-y-1.5">
                      {g.steps.map((st, i) => (
                        <li key={i} className="flex gap-2 text-xs text-fg-soft">
                          <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-inverse text-[9px] font-bold text-on-inverse">{i + 1}</span>
                          <span>{st}</span>
                        </li>
                      ))}
                    </ol>
                    <button
                      onClick={() => {
                        onGo(g.go)
                        onClose()
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-bold text-ink hover:bg-accent-strong"
                    >
                      {g.cta} <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          <p className="px-1 pt-2 text-[11px] text-fg-subtle">Dica: “Reiniciar demo” na barra superior volta todos os dados ao início, para repetir a apresentação.</p>
        </div>
      </aside>
    </div>
  )
}
