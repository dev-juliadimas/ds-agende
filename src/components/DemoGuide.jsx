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
    title: 'Aula experimental com acompanhante e ficha PAR-Q',
    value: 'Visitante agenda em 1 minuto, sem ligar para o box. O coach recebe a ficha de saúde em destaque antes da aula, e o box controla quantos experimentais cabem por turma.',
    steps: [
      'Na Agenda, toque em “Aula experimental”.',
      'Preencha nome e WhatsApp e escolha um horário Iniciante ou Todos os Níveis.',
      'Marque “Vou com meu esposo(a) / acompanhante” e informe o nome.',
      'Na mini ficha PAR-Q, marque uma lesão (ex.: dor no joelho) e agende.',
      'Vá em Gestão → Turmas → abra o mesmo horário: a ficha aparece em destaque para o coach.',
    ],
    go: { tab: 'agenda' },
    cta: 'Ir para Agenda',
  },
  {
    id: 3,
    title: 'Bot de atendimento no WhatsApp (custo zero receptivo)',
    value: 'O aluno resolve tudo pelo WhatsApp, 24h, sem a recepção digitar nada. Quando é o aluno que chama, a janela de 24h fica aberta e as respostas não são cobradas pela Meta. O bot usa as mesmas regras e o mesmo banco do site: não existe vaga duplicada.',
    steps: [
      'No celular do WhatsApp (ao lado do app; no celular, aba “WhatsApp” no topo), digite “oi”.',
      'Toque em “Reservar aula” → QUI → 06:00.',
      'Veja a grade do app atualizar na hora e o evento aparecer no painel “Supabase Realtime”.',
      'Teste também “Minhas reservas” → cancelar, e “Visitante novo” → aula experimental ou drop-in.',
      'Em Gestão → Bot & Custos, o bloco “Atendimento receptivo: custo zero” mostra que essas conversas não geram cobrança.',
    ],
    go: { tab: 'agenda', pane: 'wa' },
    cta: 'Abrir WhatsApp',
  },
  {
    id: 4,
    title: 'Lotação máxima e lista de espera automática',
    value: 'Cada horário respeita o limite de atletas que o box aguenta. Turma lotada não perde aluno: quem desiste libera a vaga e o próximo da fila entra sozinho e é avisado no WhatsApp para confirmar ou liberar com um toque.',
    steps: [
      'Gestão → Capacidade: mude o limite de um horário (ex.: 06:00 para 16), a cota de experimentais e o ajuste só desta data.',
      'Na Agenda, escolha QUI e toque na aula das 18:30 (lotada) → “Entrar na lista de espera”.',
      'Vá em Gestão → Turmas → QUI → 18:30.',
      'Na lista de chamada, toque em ➖ em qualquer aluno (“aluno avisou”).',
      'A vaga passa para a Marina na hora e chega no WhatsApp a mensagem com “Estarei lá” / “Liberar vaga”.',
    ],
    go: { tab: 'coach', coachTab: 'cap' },
    cta: 'Ir para Capacidade',
  },
  {
    id: 5,
    title: 'Check-in por GPS (“Cheguei no Box”) ou QR Code + selos do dia',
    value: 'Presença real, sem lista de papel: o GPS só libera o check-in perto do box e na janela da aula, e o QR muda a cada 30 s, então ninguém marca presença de casa. Os selos viram motivo para o aluno voltar e divulgar o box.',
    steps: [
      'O relógio da demo está em Quinta 05:50. Na Agenda, reserve QUI 06:00.',
      'GPS: no cartão do próximo treino, toque em “📍 Cheguei no Box (GPS)” ou em “Simular GPS no Box” (demo). O raio (30, 50 ou 100 m) e a janela de 15 min ficam em Gestão → Capacidade.',
      'QR: Gestão → Turmas → QUI 06:00 → “Exibir QR da turma”. Feche a tela do QR.',
      'Agenda → no cartão do próximo treino, toque em “Ler QR Code” → “Simular leitura do QR”.',
      'Assim que o check-in (GPS ou QR) é confirmado, abre na hora o modal “Treino Concluído! 🔥” com o Selo do Dia (no 1º treino, 🏅 Primeiro WOD) e as barras dos próximos selos — ex.: “1/5 treinos para Clube das 06:00” e “1/5 para Semana Imbatível”.',
      'No modal, toque em “Compartilhar nos Stories” para ver o card vertical com a logo do box e o selo do dia. O aviso do selo novo também chega no WhatsApp.',
      'Toque em “Ver todas as conquistas”: os selos estão em 4 grupos — 📅 Marcos, 🔥 Semana, 📆 Dia da Semana e ⏰ Horário — cada um com barra de progresso e status Conquistado / Em andamento. Use os filtros no topo para navegar entre as categorias.',
      'Atalhos da demonstração (fim da aba Selos) liberam na hora selos de Horário, Semana e Dia da Semana. Ao lado, o ranking mensal de assiduidade.',
    ],
    go: { tab: 'agenda' },
    cta: 'Ir para Agenda',
  },
  {
    id: 6,
    title: 'Mural de avisos fixados',
    value: 'Comunicado importante (feriado, mudança de horário, evento) fica no topo do mural e não se perde no meio do grupo do WhatsApp. O coach publica em segundos e, se quiser, dispara para os alunos.',
    steps: [
      'Aba Avisos: os “Comunicados oficiais” fixados aparecem no topo, com data em destaque e contagem (“Hoje”, “Em 8 dias”).',
      'Abaixo, filtre os outros avisos por categoria e veja os aniversariantes da semana.',
      'Gestão → Avisos: crie um aviso com título, texto e data do evento e marque “Fixar no topo”.',
      'Opcional: marque o envio no WhatsApp e escolha para quem disparar. Depende do disparo de avisos estar ligado em Bot & Custos.',
      'Publique e volte na aba Avisos: o novo comunicado está fixado. Use “Desafixar” na Gestão para tirar do topo.',
    ],
    go: { tab: 'avisos' },
    cta: 'Ir para Avisos',
  },
  {
    id: 7,
    title: 'Pagamentos (Pix, Cartão, Presencial) e bloqueio após carência',
    value: 'O aluno paga pelo celular ou no balcão, o box enxerga quem está em dia, em carência ou bloqueado, e o acesso é suspenso sozinho, sem constrangimento na recepção.',
    steps: [
      'Aba Planos: a Marina está “Em carência” (venceu 11/11, carência de 3 dias). Ela continua treinando e vê o aviso na Agenda.',
      'Toque em “Pagar agora” → Pix → “Simular Pix pago”. Situação vira “Em dia” e o recibo chega no WhatsApp.',
      'Bloqueio: ative uma reserva fixa na Agenda, volte em Planos e toque em “🔒 Bloqueado” (demo). As reservas futuras são liberadas e a Agenda passa a recusar reservas.',
      'Pague de novo e veja a reserva fixa voltar sozinha.',
      'Presencial: pague escolhendo “Pagar na recepção” e dê baixa em Gestão → Financeiro (Dinheiro ou Maquininha).',
      'Pré-reserva de 15 min: Agenda → Drop-in → escolha horário → Pix. Veja o contador e toque em “Simular 15 min sem pagar”: a vaga volta para a grade.',
    ],
    go: { tab: 'planos' },
    cta: 'Ir para Planos',
  },
  {
    id: 8,
    title: 'Programa Indique e Ganhe (desconto automático)',
    value: 'Cada aluno vira divulgador do box com um link próprio. Quando o amigo indicado faz a aula experimental e se matricula, o desconto entra sozinho na próxima mensalidade de quem indicou, sem planilha nem cupom.',
    steps: [
      'Aba Conquistas → card “Indique e Ganhe”: veja o link exclusivo e toque em “Copiar Link” ou “Enviar no WhatsApp”.',
      'Toque em “Demo: simular amigo que fez a aula e se matriculou”.',
      'O contador sobe, o amigo aparece como “Matriculado” e chega a mensagem 🎁 no WhatsApp.',
      'Aba Planos → “Pagar agora”: o desconto já aparece abatido do valor da mensalidade.',
      'Também dá para indicar pela Agenda: em “Aula experimental”, marque “Sou aluno(a) e estou indicando um amigo”.',
    ],
    go: { tab: 'conquistas' },
    cta: 'Ir para Indique e Ganhe',
  },
  {
    id: 9,
    title: 'Dashboard de faltas (no-show), Regra Anti-Falta configurável e alunos sumidos',
    value: 'O box mede quem reserva e não aparece, por dia, horário e coach, e recupera o aluno antes de ele cancelar o plano. Com a Regra Anti-Falta, quem passa do limite de faltas sem aviso no mês recebe uma penalidade automática, e o coach pode abonar quem justificou. A lista de sumidos é híbrida: o coach chama pelo próprio WhatsApp sem custo ou liga o disparo pelo bot oficial.',
    steps: [
      'Gestão → Capacidade → “Regra Anti-Falta” → Ativar. Defina o prazo para cancelar sem falta (ex.: 2h antes), a tolerância no mês (ex.: 2 faltas) e a penalidade: bloqueio de reserva antecipada por 48h, perda da reserva fixa ou desconto de 1 aula do pacote semanal.',
      'No card, toque 2× em “Registrar falta” (demo). A Agenda da Marina mostra “⚠️ Você atingiu 2 faltas sem aviso este mês” e o aviso também chega no WhatsApp. Ao reservar, aparece “Cancele até 2h antes para evitar falta”.',
      'Gestão → Turmas → escolha uma aula → “Encerrar aula”. Quem não fez check-in vira Falta (No-Show) e a regra é aplicada na hora. Ao lado de cada falta, “Abonar falta” tira a falta da contagem e retira a penalidade.',
      'Gestão → Métricas → filtro “Hoje”: cada reserva aparece como Presente, Cancelado no prazo ou Falta sem aviso.',
      'Veja taxa de assiduidade por dia, horário e coach, o funil de experimentais e o histórico individual. Dá para exportar em CSV.',
      'Role até “Alunos sumidos”: alunos com 2+ faltas seguidas ou 7+ dias sem check-in.',
      'Toque em “Chamar” → “Abrir no meu WhatsApp” (grátis) ou ligue o “Disparo automático pelo bot oficial” (custo Meta por mensagem).',
      'Em Gestão → Bot & Custos, ligue ou desligue cada disparo e veja a estimativa mensal mudar.',
    ],
    go: { tab: 'coach', coachTab: 'metricas' },
    cta: 'Ir para Métricas',
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
            <h2 className="font-display text-2xl font-extrabold uppercase">🎯 Guia de Testes</h2>
            <p className="text-[11px] text-fg-subtle">{GUIDE.length} funções • toque em uma para ver o passo a passo</p>
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
        <div className="border-t border-line px-5 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
          Desenvolvido por <span className="text-fg-muted">Double S Tech</span> • DS Agende
        </div>
      </aside>
    </div>
  )
}
