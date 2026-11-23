/*
 * Boxes pré-configurados para a demonstração (sem depender do Supabase).
 *
 * Abrir com /demo?box=<slug>. Ex.: /demo?box=icara
 * Os mesmos dados estão em supabase/migrations/20261119_icara_training_club.sql
 * (modalidades, grade semanal e planos). Mantenha os dois iguais.
 */

const ICARA = {
  slug: 'icara',
  name: 'Içara Training Club',
  // id do box no Supabase: as logos ficam em assets/boxes/<id>/logo-*.png
  boxId: 'd7864231-4ddd-4908-aa93-1bab258c19be',
  // boxes.slug no banco (a URL pública usa o slug curto acima). Usado pela Agenda do Aluno.
  dbSlug: 'icara-training-club',
  // Mesmas cores de boxes.brand_primary / brand_secondary (azul + amarelo da logo)
  primary: '#243464',
  secondary: '#fcbc18',
  monogram: 'ITC',
  // Textura de fundo da página (PNG transparente em assets/boxes/<boxId>/). Vazio = favos desenhados no código.
  // Trocou o arquivo no Storage com o mesmo nome? Aumente o ?v= para o navegador não mostrar a versão antiga.
  pattern: 'estampa.png?v=2',
  city: 'Içara • SC',

  // Página pública do box (/clientes/icara)
  page: {
    tagline: 'CROSS, HY-FITNESS e STRONG em Içara',
    about:
      'Box de treinamento com aulas em turma, conduzidas por coach. A semana tem CROSS, um dia inteiro de HY-FITNESS, turmas de STRONG/CROSS e o Aulão de sábado, com horários das 06:00 às 19:30.',
    // Contato. Com o Supabase ligado, vale o que está em boxes (address / instagram_url / whatsapp);
    // estes valores são o fallback da demo. Mantenha iguais a supabase/migrations/20261202_box_contato.sql.
    // WhatsApp: 55 + DDD + número, só dígitos. Vazio = o botão não aparece.
    whatsapp: '554896037332',
    address: 'Içara Cross, R. Castro Alves, 400 - 1º de Maio, Içara - SC, 88820-000',
    instagram: 'https://www.instagram.com/icaratrainingclub/',
  },

  // Modalidades: a cor aparece como marcador no card da aula.
  // capacity = vagas por aula (combinado com o box em 23/11/2026). Mantenha igual a
  // supabase/migrations/20261209_icara_vagas_por_modalidade.sql.
  // Wellhub/Totalpass não têm cota separada: entram nas mesmas vagas da turma.
  modalities: {
    CROSS: { label: 'CROSS', color: '#ffffff', capacity: 16, desc: 'Treino funcional de alta intensidade, com levantamentos, ginástica e condicionamento. O treino muda todo dia.' },
    HYROX: { label: 'HY-FITNESS', color: '#fcbc18', capacity: 18, desc: 'Preparação no formato HYROX: corrida intercalada com estações de força e resistência, como sled, remo, wall ball e burpees.' },
    STRONG: { label: 'STRONG', color: '#94a3b8', capacity: 8, desc: 'Foco em força: técnica dos levantamentos e progressão de carga.' },
    // Turma dividida: 8 no STRONG + 8 no CROSS
    STRONG_CROSS: { label: 'STRONG/CROSS', color: '#cbd5e1', capacity: 16, desc: 'Turma dividida no mesmo horário: 8 vagas no STRONG e 8 no CROSS.' },
    AULAO: { label: 'AULÃO', color: '#f59e0b', capacity: 30, desc: 'A aula especial de todo sábado, às 09:30, em turma única de até 30 pessoas.' },
  },

  // Grade semanal: [horário, modalidade]
  grade: {
    seg: [['06:00', 'CROSS'], ['07:00', 'CROSS'], ['08:00', 'CROSS'], ['12:10', 'CROSS'], ['16:30', 'CROSS'], ['17:30', 'CROSS'], ['18:30', 'CROSS'], ['19:30', 'HYROX']],
    ter: [['06:00', 'CROSS'], ['07:00', 'CROSS'], ['08:00', 'CROSS'], ['17:30', 'CROSS'], ['18:30', 'CROSS'], ['19:30', 'STRONG_CROSS']],
    qua: [['06:00', 'HYROX'], ['07:00', 'HYROX'], ['08:00', 'HYROX'], ['12:10', 'HYROX'], ['16:30', 'HYROX'], ['17:30', 'HYROX'], ['18:30', 'HYROX'], ['19:30', 'HYROX']],
    qui: [['06:00', 'CROSS'], ['07:00', 'CROSS'], ['08:00', 'CROSS'], ['17:30', 'CROSS'], ['18:30', 'CROSS'], ['19:30', 'STRONG_CROSS']],
    sex: [['06:00', 'CROSS'], ['07:00', 'CROSS'], ['08:00', 'CROSS'], ['12:10', 'HYROX'], ['16:30', 'CROSS'], ['17:30', 'CROSS'], ['18:30', 'HYROX'], ['19:30', 'CROSS']],
    sab: [['09:30', 'AULAO']],
  },
  // Rótulo de destaque no card (opcional)
  specials: { AULAO: 'Aulão de Sábado' },

  // Quarta é o dia do HY-FITNESS
  wods: {
    qua: { name: 'HY-FITNESS', desc: '4 rounds: 1 km Run, 20 Wall Balls, 15 Burpee Broad Jumps, 200 m Sled Push', type: 'For Time' },
  },

  // Formas de pagamento que o box aceita
  payments: ['Pix', 'cartão'],

  // Preços que o app usa na cobrança (mensal do TOTAL + aula avulsa)
  prices: { '2x': 245, '3x': 260, ilimitado: 275, dropin: 40, extra: 40 },

  // Plano da aluna da demonstração
  me: { plan: '3x', family: 'TOTAL', freq: '3x', period: 'mensal', planName: 'TOTAL 3x' },

  catalog: {
    periods: [
      { k: 'mensal', label: 'Mensal', months: 1 },
      { k: 'trimestral', label: 'Trimestral', months: 3 },
      { k: 'semestral', label: 'Semestral', months: 6 },
      { k: 'anual', label: 'Anual', months: 12 },
    ],
    families: [
      {
        k: 'TOTAL',
        label: 'TOTAL',
        desc: 'Todas as modalidades: CROSS + HY-FITNESS + STRONG',
        rows: [
          { freq: '2x', label: '2x por semana', kind: '2x', prices: { mensal: 245, trimestral: 225, semestral: 200, anual: 185 } },
          { freq: '3x', label: '3x por semana', kind: '3x', prices: { mensal: 260, trimestral: 240, semestral: 220, anual: 195 } },
          { freq: 'livre', label: 'Livre', kind: 'ilimitado', prices: { mensal: 275, trimestral: 255, semestral: 235, anual: 215 } },
        ],
      },
      {
        k: 'HYF',
        label: 'HY-FITNESS',
        desc: 'Só as aulas de HY-FITNESS (HYROX)',
        rows: [
          { freq: '2x', label: '2x por semana', prices: { mensal: 245, trimestral: 235, semestral: 215, anual: 175 } },
          { freq: '3x', label: '3x por semana', prices: { mensal: 265, trimestral: 255, semestral: 235, anual: 195 } },
        ],
        addon: { label: 'Inclua as aulas de STRONG', price: 40 },
      },
    ],
    avulsos: [
      { label: '1x por semana', sub: 'Sem fidelidade', price: 125, unit: '/mês' },
      { label: 'Aula avulsa (drop-in)', sub: 'Qualquer modalidade', price: 40, unit: '/aula' },
    ],
  },
}

export const PRESETS = { icara: ICARA }

/** Box com página pública cujo nome bate com o do card da vitrine (featured_clients.name). */
const norm = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
export const presetByName = (name) => Object.values(PRESETS).find((p) => p.page && norm(p.name) === norm(name)) || null

/** Box escolhido pela URL (?box=icara) ou null. */
export function activePreset() {
  if (typeof window === 'undefined') return null
  return PRESETS[new URLSearchParams(window.location.search).get('box')] || null
}
