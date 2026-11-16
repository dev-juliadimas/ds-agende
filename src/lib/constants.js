// Configurações do box (em produção vêm da tabela `box_settings` no Supabase)
export const BOX = {
  name: 'Içara Cross',
  short: 'IÇARA CROSS',
  address: 'Rua das Barras, 120 — Centro',
  lat: -23.5505,
  lng: -46.6333,
  gpsRadiusM: 50,
  checkinWindowMin: 15,
}

export const DAYS = [
  { key: 'seg', label: 'Segunda', short: 'SEG', date: '2026-11-09' },
  { key: 'ter', label: 'Terça', short: 'TER', date: '2026-11-10' },
  { key: 'qua', label: 'Quarta', short: 'QUA', date: '2026-11-11' },
  { key: 'qui', label: 'Quinta', short: 'QUI', date: '2026-11-12' },
  { key: 'sex', label: 'Sexta', short: 'SEX', date: '2026-11-13' },
  { key: 'sab', label: 'Sábado', short: 'SÁB', date: '2026-11-14' },
]
export const dayIndex = (key) => DAYS.findIndex((d) => d.key === key)
export const dayByKey = (key) => DAYS.find((d) => d.key === key)
export const fmtDate = (iso) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export const WEEKDAY_TIMES = ['06:00', '07:00', '08:00', '12:10', '16:30', '17:30', '18:30', '19:30']
export const SATURDAY_TIMES = ['08:00', '09:30']

export const LEVELS = {
  misto: { label: 'Todos os Níveis', short: 'Misto', cls: 'bg-sky-500/15 text-sky-300 ring-sky-400/30', dot: 'bg-sky-400' },
  iniciante: { label: 'Iniciante / Experimental', short: 'Iniciante', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', dot: 'bg-emerald-400' },
  scaled: { label: 'Intermediário / Scaled', short: 'Scaled', cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', dot: 'bg-amber-400' },
  rx: { label: 'Avançado / RX', short: 'RX', cls: 'bg-rose-500/15 text-rose-300 ring-rose-400/30', dot: 'bg-rose-400' },
}
export const TRIAL_LEVELS = ['iniciante', 'misto']

export const COACHES = ['Coach Rafa', 'Coach Bia', 'Coach Léo']

// Preços padrão (o gestor edita em Coach/Gestão → Financeiro → settings.prices)
export const PLANS = {
  '2x': { label: '2x por semana', limit: 2, price: 189 },
  '3x': { label: '3x por semana', limit: 3, price: 229 },
  ilimitado: { label: 'Ilimitado', limit: Infinity, price: 269 },
}
export const PIX_EXTRA_PRICE = 35
export const DROPIN_PRICE = 50
export const HOLD_MINUTES = 15 // pré-reserva de aula avulsa aguardando Pix/Cartão
export const brl = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const PAY_METHODS = {
  pix: { label: 'Pix', emoji: '💠' },
  cartao: { label: 'Cartão de crédito', emoji: '💳' },
  recepcao: { label: 'Na recepção', emoji: '🏪' },
  dinheiro: { label: 'Dinheiro (recepção)', emoji: '💵' },
  maquininha: { label: 'Maquininha (recepção)', emoji: '🏧' },
}

/*
 * Disparos ativos do bot (mensagens que o robô inicia).
 * A Meta cobra por mensagem de modelo (template) enviada fora da janela de 24h.
 * Respostas a quem chamou o bot primeiro (janela de atendimento aberta) não custam nada.
 * Valores de referência por mensagem no Brasil — confira a tabela vigente da Meta.
 */
export const META_PRICE = { utilidade: 0.04, marketing: 0.35 }
export const DISPATCHES = [
  { k: 'reminder', label: 'Lembrete anti-falta (véspera, 20:00)', cat: 'utilidade', perMonth: 520 },
  { k: 'waitlist', label: 'Vaga liberada da lista de espera', cat: 'utilidade', perMonth: 60 },
  { k: 'billing', label: 'Cobrança: vencimento, carência e bloqueio', cat: 'utilidade', perMonth: 90 },
  { k: 'urgent', label: 'Aviso urgente (aula cancelada, chuva…)', cat: 'utilidade', perMonth: 40 },
  { k: 'badge', label: 'Parabéns por selo conquistado', cat: 'marketing', perMonth: 140 },
  { k: 'rescue', label: 'Resgate de aluno sumido (automático)', cat: 'marketing', perMonth: 25 },
  { k: 'penalty', label: 'Regra anti-falta: penalidade aplicada ou abonada', cat: 'utilidade', perMonth: 15 },
]

// Regra Anti-Falta: o que acontece quando o aluno atinge o limite de faltas sem aviso no mês
export const PENALTIES = {
  block48: { label: 'Bloqueio de reserva antecipada por 48h', short: 'Reservas antecipadas suspensas por 48h', desc: 'Durante 48h o aluno só reserva aulas do próprio dia.' },
  loseRecurring: { label: 'Perda da reserva fixa recorrente', short: 'Reserva fixa cancelada', desc: 'A reserva fixa é desativada e as vagas futuras vão para a lista de espera.' },
  deductWeekly: { label: 'Descontar aula do pacote semanal', short: '1 aula descontada do pacote desta semana', desc: 'O limite semanal do plano cai 1 aula nesta semana.' },
}

// Selos agrupados em 4 categorias (Conquistas). `metric` é o contador no perfil do aluno.
export const BADGE_CATS = [
  { k: 'dia', emoji: '📅', label: 'Selos do Dia / Marcos', short: 'Marcos' },
  { k: 'semana', emoji: '🔥', label: 'Selos da Semana (Constância)', short: 'Semana' },
  { k: 'diasem', emoji: '📆', label: 'Selos por Dia da Semana', short: 'Dia da semana' },
  { k: 'horario', emoji: '⏰', label: 'Selos por Horário', short: 'Horário' },
]

export const BADGES = [
  // 📅 Marcos
  { id: 'first_wod', cat: 'dia', emoji: '🏅', name: 'Primeiro WOD', desc: 'Você completou sua primeira aula!', goal: 1, metric: 'total', unit: 'treino' },
  { id: 'm10', cat: 'dia', emoji: '🏆', name: '10 Treinos', desc: 'Marco de frequência: 10 treinos concluídos', goal: 10, metric: 'total', unit: 'treinos' },
  { id: 'm50', cat: 'dia', emoji: '🥈', name: '50 Treinos', desc: 'Marco de frequência: 50 treinos concluídos', goal: 50, metric: 'total', unit: 'treinos' },
  { id: 'm100', cat: 'dia', emoji: '👑', name: '100 Treinos', desc: 'Marco de frequência: 100 treinos concluídos', goal: 100, metric: 'total', unit: 'treinos' },
  { id: 'dupla', cat: 'dia', emoji: '🤝', name: 'Treino em Dupla', desc: 'Indicou um amigo e ele compareceu à aula experimental', goal: 1, metric: 'referrals', unit: 'indicação' },
  // 🔥 Semana
  { id: 'ritmo', cat: 'semana', emoji: '💪', name: 'Ritmo Firme', desc: '3 treinos na mesma semana', goal: 3, metric: 'week', unit: 'treinos' },
  { id: 'semana', cat: 'semana', emoji: '⚡', name: 'Semana Imbatível', desc: '5 treinos na mesma semana', goal: 5, metric: 'week', unit: 'treinos' },
  { id: 'sem4', cat: 'semana', emoji: '🗓️', name: '4 Semanas sem Falta', desc: '4 semanas seguidas batendo 3+ treinos', goal: 4, metric: 'weeksInRow', unit: 'semanas' },
  // 📆 Dia da semana
  { id: 'seg5', cat: 'diasem', emoji: '🛡️', name: 'Guerreiro de Segunda', desc: '5 segundas-feiras seguidas treinando', goal: 5, metric: 'mondays', unit: 'segundas' },
  { id: 'sex5', cat: 'diasem', emoji: '🎉', name: 'Sextou no Box', desc: '5 sextas-feiras treinando', goal: 5, metric: 'fridays', unit: 'sextas' },
  { id: 'sab3', cat: 'diasem', emoji: '🏋️', name: 'Sábado de Aulão', desc: '3 sábados concluídos', goal: 3, metric: 'saturdays', unit: 'sábados' },
  // ⏰ Horário
  { id: 'madrugador', cat: 'horario', emoji: '🌅', name: 'Clube das 06:00', desc: 'Madrugador: 5 treinos às 06:00', goal: 5, metric: 'early', unit: 'treinos', time: '06:00' },
  { id: 'almoco', cat: 'horario', emoji: '🥗', name: 'Turma do Almoço', desc: '5 treinos na aula das 12:10', goal: 5, metric: 'lunch', unit: 'treinos', time: '12:10' },
  { id: 'corujao', cat: 'horario', emoji: '🦉', name: 'Corujão das 19:30', desc: '5 treinos na aula da noite (19:30)', goal: 5, metric: 'night', unit: 'treinos', time: '19:30' },
]
export const BADGE_METRICS = ['total', 'referrals', 'week', 'weeksInRow', 'mondays', 'fridays', 'saturdays', 'early', 'lunch', 'night']
export const badgeValue = (p, b) => Math.min(b.goal, p[b.metric] || 0)

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export const CLASS_DURATION = 60

export const ME_ID = 'me'
