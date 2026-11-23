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
  ACESSO_BLOQUEADO: 'Plano vencido: sua mensalidade está em atraso. Regularize para voltar a reservar.',
  // trava de plano ativo (migrations/20261129_trava_plano_ativo.sql). O banco manda o texto após o ':'
  PLANO_INATIVO: 'Você precisa de um plano ativo para agendar aulas.',
  LIMITE_PLANO: 'Você já usou todas as aulas do seu plano nesta semana (segunda a domingo).',
  // regras do plano (migrations/20261130_regras_plano.sql). O banco manda o texto após o ':'
  MODALIDADE_NAO_INCLUSA: 'Seu plano não inclui esta modalidade. Fale com o box para trocar de plano.',
  // app_book_class / app_leave_waitlist / get_agenda (migrations/20261120_agenda_aluno.sql)
  JA_INSCRITO: 'Você já está inscrito nesta aula.',
  // troca de aula com o limite da semana cheio (migrations/20261204_troca_de_aula.sql)
  TROCA_FORA_DO_PRAZO: 'O prazo para cancelar essa aula sem perder o crédito já passou. Escolha outra aula para trocar.',
  JA_NA_FILA: 'Você já está na lista de espera desta aula.',
  NAO_NA_FILA: 'Você não está na lista de espera desta aula.',
  BOX_NAO_ENCONTRADO: 'Box não encontrado.',
  TESTE_DESATIVADO: 'O login de teste está desligado para este box.',
  // link_my_account (migrations/20261121_login_email.sql)
  TELEFONE_NAO_CADASTRADO: 'Não achamos esse telefone no cadastro do box. Confira o número ou fale com a recepção.',
  TELEFONE_JA_TEM_CONTA: 'Esse telefone já está ligado a outra conta. Fale com a recepção.',
  // self_signup / app_book_class (migrations/20261122_auto_cadastro.sql)
  CADASTRO_EXPIRADO: 'Não foi possível concluir o cadastro. Entre com seu e-mail e senha para terminar.',
  NOME_INVALIDO: 'Informe seu nome completo (nome e sobrenome).',
  TELEFONE_INVALIDO: 'WhatsApp inválido. Use DDD + número, ex.: (48) 99999-0000.',
  TELEFONE_JA_CADASTRADO: 'Esse WhatsApp já está no cadastro do box. Use "Já sou aluno do box" para criar sua conta.',
  DATA_INVALIDA: 'Data de nascimento inválida.',
  MENOR_DE_IDADE: 'Menores de 18 anos: o cadastro é feito com o responsável, na recepção do box.',
  CONSENTIMENTO_OBRIGATORIO: 'Para continuar, aceite o Termo de Responsabilidade e o consentimento LGPD.',
  ANAMNESE_INCOMPLETA: 'Responda todas as perguntas da ficha de saúde.',
  PLANO_INVALIDO: 'Plano indisponível. Escolha outro plano.',
  LIMITE_EXPERIMENTAL: 'Você já usou sua aula experimental. Fale com o box para escolher um plano.',
  LIMITE_AVULSA: 'Sua aula avulsa já está reservada. Para treinar mais, fale com o box.',
  // painel do administrador / formulário de interesse (migrations/20261123_painel_admin.sql)
  MUITAS_TENTATIVAS: 'Muitos pedidos agora. Tente de novo em alguns minutos ou chame o box no WhatsApp.',
  LEAD_NAO_ENCONTRADO: 'Interessado não encontrado. Atualize a lista.',
  // mural de avisos (migrations/20261127_avisos_moderacao.sql)
  COACH_NAO_ENCONTRADO: 'Coach não encontrado. Atualize a lista.',
  // coach por aula e trocas entre coaches (migrations/20261207_coach_por_aula_e_trocas.sql)
  COACH_INVALIDO: 'Escolha um coach da equipe do box (diferente de você).',
  TURMA_NAO_ENCONTRADA: 'Turma não encontrada. Atualize a lista.',
  AULA_SEM_COACH: 'Esta aula não tem coach fixo: escolha um coach para ela.',
  ALCANCE_INVALIDO: 'Escolha se a troca vale só para esta data ou para a turma toda semana.',
  NAO_E_SUA_AULA: 'Só o coach desta aula pode pedir a troca.',
  NAO_E_SUA_TURMA: 'Só o coach fixo da turma pode passar a turma toda semana.',
  AULA_SEM_TURMA_FIXA: 'Esta é uma aula especial: dá para trocar só esta data.',
  TROCA_JA_PEDIDA: 'Já existe um pedido de troca pendente para esta aula.',
  TROCA_NAO_ENCONTRADA: 'Pedido de troca não encontrado. Atualize a lista.',
  TROCA_JA_RESPONDIDA: 'Este pedido de troca já foi respondido ou cancelado.',
  TROCA_DESATUALIZADA: 'A aula mudou de coach depois do pedido. Peça uma nova troca.',
  // gestão da equipe (migrations/20261208_gestao_equipe.sql)
  MEMBRO_NAO_ENCONTRADO: 'Membro da equipe não encontrado. Atualize a lista.',
  TELEFONE_EM_USO: 'Esse WhatsApp já é de outra pessoa do box.',
  EMAIL_INVALIDO: 'E-mail inválido. Confira o endereço, ex.: nome@gmail.com.',
  EMAIL_EM_USO: 'Esse e-mail já é usado por outra conta.',
  SEM_CONTA_APP: 'Esta pessoa ainda não criou conta no app: o e-mail é definido no cadastro dela.',
  PAPEL_INVALIDO: 'Escolha Administrador, Coach ou Aluno.',
  ULTIMO_ADMIN: 'O box precisa de pelo menos um administrador ativo. Promova outra pessoa antes de mudar este papel.',
  COACH_COM_AULAS: 'Este coach ainda tem aulas. Use “Desativar coach” para passar as aulas a outra pessoa antes.',
  MEMBRO_INATIVO: 'Este coach está inativo. Reative antes.',
  NAO_E_COACH: 'Só coaches podem ser desativados. Mude o papel de administrador para coach antes.',
  SUBSTITUTO_OBRIGATORIO: 'Este coach tem aulas: escolha quem vai assumir antes de desativar.',
  SUBSTITUTO_INVALIDO: 'Escolha outro coach ou administrador ativo do box para assumir as aulas.',
  LINK_COMUNIDADE_INVALIDO: 'Link inválido. Cole o convite da Comunidade, no formato https://chat.whatsapp.com/…',
  STATUS_INVALIDO: 'Situação inválida.',
  // horário fixo (migrations/20261130_horario_fixo.sql)
  HORARIO_FIXO_LIMITE: 'Você já fixou todos os horários que seu plano permite por semana. Desative um no Perfil para fixar este.',
  HORARIO_FIXO_SO_ALUNO: 'Horário fixo é só para alunos com plano.',
  HORARIO_FIXO_NAO_ENCONTRADO: 'Horário fixo não encontrado. Atualize a lista.',
  HORARIO_INATIVO: 'Esta turma saiu da grade do box.',
  // super admin (migrations/20261130_super_admin.sql)
  NOME_CLIENTE_INVALIDO: 'Informe o nome do cliente (2 a 80 letras).',
  SLUG_INVALIDO: 'Slug inválido. Use só letras minúsculas, números e hífen, ex.: icara-training-club.',
  SLUG_EM_USO: 'Esse slug já é de outro cliente. Escolha outro.',
  COR_INVALIDA: 'Cor inválida. Use o formato #RRGGBB.',
  URL_LOGO_INVALIDA: 'A URL da logo precisa começar com https://',
  // feriados e aulas especiais (migrations/20261130_feriados_aulas_especiais.sql)
  DATA_PASSADA: 'Escolha uma data (e horário) a partir de agora.',
  TIPO_DATA_INVALIDO: 'Escolha Feriado ou Data especial.',
  TITULO_INVALIDO: 'Informe um título de 2 a 60 letras, ex.: Feriado Nacional.',
  DATA_NAO_ENCONTRADA: 'Esta data não está mais marcada. Atualize a lista.',
  HORARIO_INVALIDO: 'Informe a data e o horário da aula.',
  DURACAO_INVALIDA: 'A duração deve ficar entre 15 e 240 minutos.',
  CAPACIDADE_INVALIDA: 'As vagas devem ficar entre 1 e 200.',
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
  // cadastro em lote e senha provisória (migrations/20261210_cadastro_em_lote.sql)
  LISTA_INVALIDA: 'Lista inválida. Confira as colunas Nome, Email, CPF e Telefone.',
  LISTA_VAZIA: 'Nenhum aluno na lista.',
  LISTA_GRANDE: 'Envie no máximo 500 alunos por vez. Divida a planilha em partes.',
  ALUNO_NAO_ENCONTRADO: 'Aluno não encontrado. Atualize a lista.',
  RESET_SO_ALUNO: 'Só dá para resetar a senha de alunos. Equipe usa "Esqueci a senha".',
  ALUNO_SEM_CONTA: 'Este aluno ainda não tem conta no app. Cadastre o e-mail dele em "Cadastrar alunos".',
  CONTA_EM_OUTRO_BOX: 'Esta conta também é usada em outro box. Peça ao aluno para usar "Esqueci a senha".',
  SEM_CPF_TELEFONE: 'Informe o CPF ou o WhatsApp: um deles vira a senha provisória.',
  SENHA_PROVISORIA: 'A nova senha não pode ser o seu CPF ou telefone. Escolha outra.',
  // front-end
  SUPABASE_NAO_CONFIGURADO: 'Servidor não configurado. Verifique o arquivo .env.',
}

// Erros genéricos do Postgres / PostgREST / rede
const PG_CODES = {
  23505: 'Você já tem uma reserva nesta aula.', // unique_violation (bookings_one_active / waitlist pk)
  42501: 'Você não tem permissão para esta ação.', // insufficient_privilege (RLS)
  23514: 'Confira os campos: título até 120 letras e mensagem até 2000.', // check_violation (ex.: notices)
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
  // 'CODIGO: mensagem' → o banco já mandou o texto para o aluno (ex.: PLANO_INATIVO)
  const dbText = known && raw.startsWith(`${known}:`) ? raw.slice(known.length + 1).trim() : ''
  if (known) return { code: known, message: dbText || ERROR_MESSAGES[known] }

  if (err.code && PG_CODES[err.code]) return { code: String(err.code), message: PG_CODES[err.code] }

  // fetch falhou (offline, DNS, CORS) — comum no PWA com sinal ruim dentro do box
  if (err.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return { code: 'OFFLINE', message: 'Sem conexão. Verifique sua internet e tente de novo.' }
  }

  if (import.meta.env.DEV) console.error('[supabase] erro não mapeado:', err)
  return { code: err.code || 'DESCONHECIDO', message: FALLBACK }
}
