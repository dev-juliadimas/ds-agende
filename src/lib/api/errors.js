/*
 * Tradução dos erros do banco para mensagens de Toast.
 * As RPCs fazem `raise exception 'CODIGO'`; o PostgREST devolve isso em `error.message`.
 * Qualquer código novo criado no schema.sql deve ganhar uma linha aqui.
 */

export const ERROR_MESSAGES = {
  // book_class
  AULA_ENCERRADA: 'Esta aula já foi encerrada ou cancelada.',
  AGENDA_FECHADA: 'A agenda deste dia ainda não abriu para reservas.',
  VENDA_BLOQUEADA: 'Este horário não está disponível para aula avulsa. Escolha um horário mais vazio.',
  NIVEL_INCOMPATIVEL: 'Aula experimental só em turmas Iniciante ou Mista.',
  COTA_EXPERIMENTAL: 'As vagas de aula experimental deste horário já foram preenchidas.',
  TURMA_LOTADA: 'Turma lotada! Entre na lista de espera para ser avisado se abrir vaga.',
  ACESSO_BLOQUEADO: 'Seu acesso está bloqueado por mensalidade em atraso. Regularize em Planos.',
  LIMITE_PLANO: 'Limite do plano atingido nesta semana.',
  // cancel_booking
  FORA_DO_PRAZO: 'Prazo de cancelamento encerrado. Fale com o coach.',
  // checkin_qr
  QR_INVALIDO_OU_EXPIRADO: 'QR Code expirado. Aponte a câmera para o código atual da TV.',
  SEM_RESERVA: 'Você não tem reserva confirmada nesta aula.',
  // pagamentos
  COBRANCA_NAO_PENDENTE: 'Esta cobrança já foi paga ou cancelada.',
  PRE_RESERVA_EXPIRADA: 'O tempo da pré-reserva acabou. Reserve novamente.',
  // permissões (migrations/20261118_lock_rpcs.sql)
  NAO_AUTENTICADO: 'Entre na sua conta para continuar.',
  SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
  AULA_NAO_ENCONTRADA: 'Aula não encontrada. Atualize a agenda.',
  RESERVA_NAO_ENCONTRADA: 'Reserva não encontrada. Atualize a agenda.',
  RESERVA_INATIVA: 'Esta reserva já foi cancelada ou concluída.',
  COBRANCA_NAO_ENCONTRADA: 'Cobrança não encontrada.',
  // front-end
  SUPABASE_NAO_CONFIGURADO: 'Servidor não configurado. Verifique o arquivo .env.',
}

// Erros genéricos do Postgres / PostgREST / rede
const PG_CODES = {
  23505: 'Você já tem uma reserva nesta aula.', // unique_violation (bookings_one_active / waitlist pk)
  42501: 'Você não tem permissão para esta ação.', // insufficient_privilege (RLS)
  PGRST301: 'Sua sessão expirou. Entre novamente.', // JWT expirado
}

const FALLBACK = 'Não foi possível concluir. Tente novamente em instantes.'

/**
 * Normaliza qualquer erro (do Supabase ou de rede) para { code, message }.
 * `code` serve para lógica (ex.: abrir lista de espera em TURMA_LOTADA);
 * `message` vai direto para o Toast.
 */
export function toFriendlyError(err) {
  if (!err) return { code: 'DESCONHECIDO', message: FALLBACK }

  // raise exception 'CODIGO' → message === 'CODIGO'
  const raw = String(err.message || '').trim()
  const known = Object.keys(ERROR_MESSAGES).find((c) => raw === c || raw.startsWith(`${c}:`) || raw.includes(c))
  if (known) return { code: known, message: ERROR_MESSAGES[known] }

  if (err.code && PG_CODES[err.code]) return { code: String(err.code), message: PG_CODES[err.code] }

  // fetch falhou (offline, DNS, CORS) — comum no PWA com sinal ruim dentro do box
  if (err.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return { code: 'OFFLINE', message: 'Sem conexão. Verifique sua internet e tente de novo.' }
  }

  if (import.meta.env.DEV) console.error('[supabase] erro não mapeado:', err)
  return { code: err.code || 'DESCONHECIDO', message: FALLBACK }
}
