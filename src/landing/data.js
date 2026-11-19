/*
 * Conteúdo da landing page: links, textos dos cards e clientes.
 * Tudo que você vai querer trocar fica aqui; os componentes em ./sections só desenham.
 */
import {
  BellRing, ChartColumn, Clock, Dumbbell, HeartHandshake, ListOrdered, MessageCircle,
  QrCode, Repeat, ShieldCheck, Smartphone, Sparkles, UserPlus, Users, Wallet,
} from 'lucide-react'

/* ── Links ── */

// BASE: para imagens da pasta public/. A demo é a rota /demo (ver src/App.jsx);
// ?guia=1 abre o Guia Passo a Passo automaticamente.
export const BASE = import.meta.env.BASE_URL
export const DEMO_PATH = '/demo?guia=1'

// TROCAR: número real do consultor (formato 55 + DDD + número, só dígitos)
export const CONSULTOR_URL =
  'https://wa.me/5548999999999?text=' +
  encodeURIComponent('Olá! Vi a página do DS Agende e quero entender como funciona no meu negócio.')

export const NAV = [
  { href: '#formatos', label: 'Para quem é' },
  { href: '#beneficios', label: 'Benefícios' },
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#clientes', label: 'Clientes' },
  { href: '#duvidas', label: 'Dúvidas' },
]

/* ── 2. Feito para o seu formato de atendimento ── */

export const FORMATS = [
  {
    key: 'individual',
    tab: 'Profissionais',
    tabHint: '1 por horário',
    icon: Sparkles,
    chips: ['Manicure', 'Nail designer', 'Maquiadora', 'Penteadista', 'Estética', 'Barbearia'],
    label: 'Para profissionais',
    title: 'Cada horário reservado para uma cliente, e ela aparece',
    audience: 'Manicures, nail designers, penteadistas, maquiadoras, esteticistas, barbearias e profissionais liberais.',
    items: [
      {
        icon: Clock,
        title: 'Serviço e duração certos',
        text: 'A cliente escolhe “Alongamento em gel” ou “Penteado para noiva” e a agenda reserva o tempo exato de cada serviço.',
      },
      {
        icon: Wallet,
        title: 'Sinal via Pix para garantir',
        text: 'O horário só é confirmado depois do sinal. Quem paga adiantado dificilmente falta.',
      },
      {
        icon: BellRing,
        title: 'Lembrete que evita o bolo',
        text: 'Na véspera, a cliente recebe a mensagem no WhatsApp e confirma ou libera o horário com um toque.',
      },
      {
        icon: ListOrdered,
        title: 'Fila de espera para encaixes',
        text: 'Quem queria aquele horário entra na fila e é chamada assim que ele abrir.',
      },
    ],
  },
  {
    key: 'coletivo',
    tab: 'Turmas e aulas',
    tabHint: 'coletivas',
    icon: Dumbbell,
    chips: ['CrossFit', 'Pilates', 'CTs', 'Funcional', 'Aulas em grupo'],
    label: 'Para estúdios e boxes',
    title: 'Turmas cheias, dentro do limite, sem planilha',
    audience: 'Boxes de CrossFit, CTs, estúdios de Pilates, funcional e aulas em grupo.',
    items: [
      {
        icon: Users,
        title: 'Limite de vagas por turma',
        text: 'Cada aula tem sua lotação. Quando enche, quem chega depois vai para a fila automaticamente.',
      },
      {
        icon: QrCode,
        title: 'Check-in por QR Code ou GPS',
        text: 'QR na TV da recepção que muda a cada 30 segundos, ou check-in quando o aluno chega perto do espaço.',
      },
      {
        icon: Repeat,
        title: 'Planos e mensalidades',
        text: 'Mensal, trimestral ou pacote de aulas. Inadimplente é bloqueado e a vaga fica com quem está em dia.',
      },
      {
        icon: UserPlus,
        title: 'Aulas experimentais',
        text: 'O visitante agenda, preenche a ficha de saúde (PAR-Q) e o professor vê quem é novo na turma.',
      },
    ],
  },
]

/* ── 3. Por que o DS Agende? ── */

export const BENEFITS = [
  {
    icon: BellRing,
    title: 'Fim das faltas',
    text: 'Na véspera, o WhatsApp lembra o cliente com dois botões: “Confirmar” ou “Liberar horário”. Quem não vai avisa antes.',
  },
  {
    icon: ListOrdered,
    title: 'Encaixe automático',
    text: 'Alguém cancelou? O próximo da fila recebe o aviso no WhatsApp na mesma hora e garante o horário respondendo.',
  },
  {
    icon: Smartphone,
    title: 'Zero instalação',
    text: 'O cliente agenda pelo seu link ou direto no WhatsApp. Nada para baixar da loja de aplicativos.',
  },
  {
    icon: ShieldCheck,
    title: 'Sem conflito de horários',
    text: 'Site e WhatsApp seguem a mesma regra, em tempo real. Duas pessoas nunca ficam com o mesmo horário.',
  },
]

// Contadores da faixa de benefícios (animam ao aparecer na tela)
export const STATS = [
  { value: 15, suffix: ' min', label: 'de pré-reserva enquanto o Pix não cai' },
  { value: 30, suffix: ' s', label: 'para o QR Code de check-in se renovar' },
  { value: 1, suffix: ' toque', label: 'para o cliente confirmar ou liberar a vaga' },
  { value: 100, suffix: '%', label: 'sincronizado entre site e WhatsApp' },
]

/* ── 4. Funcionalidades (Bento Grid) ──
 * `dark: true` destaca o card em marrom; `span` ocupa 2 colunas no desktop;
 * `visual` escolhe a mini-ilustração do card (ver sections/Features.jsx). */

export const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Bot de WhatsApp inteligente',
    text: 'Agenda, lembra, cobra e avisa sozinho, pela API oficial da Meta. O cliente resolve tudo na conversa, sem esperar resposta da recepção.',
    note: 'Você escolhe quais mensagens o bot envia e acompanha a estimativa de custo do mês.',
    tags: ['Agendamento', 'Lembretes', 'Cobranças', 'Avisos'],
    dark: true,
    span: true,
    visual: 'chat',
  },
  {
    icon: Wallet,
    title: 'Financeiro com sinal via Pix ou cartão',
    text: 'O horário fica pré-reservado enquanto o cliente paga. Se o pagamento não cair em 15 minutos, ele volta para a agenda.',
    visual: 'timer',
    tags: ['Pix', 'Cartão', 'Mensalidades', 'Pacotes'],
  },
  {
    icon: HeartHandshake,
    title: 'Retenção e fidelização',
    text: 'O sistema mostra quem sumiu e você chama de volta com 1 clique no WhatsApp. Selos e benefícios premiam quem é frequente.',
    visual: 'retention',
    tags: ['Clientes sumidos', 'Selos', 'Benefícios'],
  },
  {
    icon: ChartColumn,
    title: 'Gestão completa',
    text: 'Taxa de faltas, horários mais procurados e a agenda inteira na palma da mão, no celular ou no computador.',
    visual: 'chart',
    span: true,
    tags: ['Métricas', 'Agenda', 'Relatórios'],
  },
]

/* ── 5. Eles já usam ── os clientes vêm do Supabase (tabela featured_clients,
 * ver supabase/migrations/20261119_featured_clients.sql). Aqui fica só o filtro:
 * `key` casa com a coluna `format` (individual | coletivo). */

export const CLIENT_FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'individual', label: 'Profissionais' },
  { key: 'coletivo', label: 'Turmas' },
]

/* ── 6. Dúvidas frequentes ── */

export const FAQ = [
  {
    q: 'Meu cliente precisa baixar algum aplicativo?',
    a: 'Não. Ele agenda pelo seu link, que abre no navegador do celular, ou direto na conversa do WhatsApp. Se quiser, salva o atalho na tela inicial com um toque.',
  },
  {
    q: 'Funciona no meu WhatsApp?',
    a: 'O bot usa a API oficial do WhatsApp (Meta), então as mensagens saem com o nome do seu negócio. Na implantação a gente define junto se usa um número novo ou o que você já tem, e você escolhe quais mensagens o bot envia.',
  },
  {
    q: 'E se o cliente não pagar o sinal?',
    a: 'O horário fica pré-reservado por 15 minutos. Se o Pix não cair nesse tempo, ele volta para a agenda sozinho e o próximo da fila de espera é avisado.',
  },
  {
    q: 'Serve para atendimento individual e para turmas?',
    a: 'Sim. Você escolhe o formato: um cliente por horário, com duração por serviço, ou turmas com limite de vagas, check-in e planos. A agenda se ajusta ao seu jeito de atender.',
  },
]
