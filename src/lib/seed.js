import { DAYS, WEEKDAY_TIMES, SATURDAY_TIMES, COACHES, ME_ID, BADGES } from './constants'

// RNG determinístico para a demo ficar igual a cada recarga
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LEVEL_MAP = {
  '06:00': 'misto',
  '07:00': 'rx',
  '08:00': 'iniciante',
  '12:10': 'misto',
  '16:30': 'scaled',
  '17:30': 'iniciante',
  '18:30': 'misto',
  '19:30': 'rx',
}
const CAP_MAP = { '06:00': 12, '07:00': 12, '08:00': 10, '12:10': 10, '16:30': 12, '17:30': 12, '18:30': 16, '19:30': 14 }
const COACH_MAP = {
  '06:00': 'Coach Rafa',
  '07:00': 'Coach Rafa',
  '08:00': 'Coach Bia',
  '12:10': 'Coach Léo',
  '16:30': 'Coach Bia',
  '17:30': 'Coach Bia',
  '18:30': 'Coach Léo',
  '19:30': 'Coach Léo',
}

export const WODS = {
  seg: { name: 'FRAN', desc: '21-15-9 Thrusters (43/30 kg) + Pull-ups', type: 'For Time' },
  ter: { name: 'CINDY', desc: 'AMRAP 20′: 5 Pull-ups, 10 Push-ups, 15 Air Squats', type: 'AMRAP' },
  qua: { name: 'EMOM 16′', desc: 'Min ímpar: 2 Clean & Jerk • Min par: 12 Cal Row', type: 'EMOM' },
  qui: { name: 'HELEN', desc: '3 rounds: Run 400 m, 21 KB Swings (24/16 kg), 12 Pull-ups', type: 'For Time' },
  sex: { name: 'SEXTA INSANA', desc: 'Chipper: 50 Wall Balls, 40 Box Jumps, 30 T2B, 20 Burpees, 10 Snatches', type: 'For Time' },
  sab: { name: 'PARTNER WOD', desc: 'Em dupla: 100 Wall Balls, 80 Box Jumps, 60 DB Snatches, 40 Burpees', type: 'For Time' },
}

export function buildSlots(preset = null) {
  if (preset?.grade) return buildPresetSlots(preset)
  const slots = []
  for (const d of DAYS) {
    const times = d.key === 'sab' ? SATURDAY_TIMES : WEEKDAY_TIMES
    for (const t of times) {
      let level = LEVEL_MAP[t] || 'misto'
      if ((d.key === 'ter' || d.key === 'qui') && t === '07:00') level = 'scaled'
      if (d.key === 'sab') level = t === '08:00' ? 'misto' : 'iniciante'
      slots.push({
        id: `${d.key}-${t.replace(':', '')}`,
        day: d.key,
        time: t,
        level,
        coach: d.key === 'sab' ? (t === '08:00' ? 'Coach Rafa' : 'Coach Bia') : COACH_MAP[t],
        capacity: d.key === 'sab' ? (t === '08:00' ? 20 : 12) : CAP_MAP[t],
        trialQuota: 2,
        override: null, // ajuste excepcional desta data (não altera a grade fixa)
        special: d.key === 'sab' ? (t === '08:00' ? 'Aulão de Sábado' : 'Fundamentos') : null,
        closed: false,
      })
    }
  }
  return slots
}

// Grade real de um box pré-configurado (src/lib/boxPresets.js): turma única por horário, sem divisão por nível
function buildPresetSlots(preset) {
  const slots = []
  for (const d of DAYS) {
    for (const [t, modality] of preset.grade[d.key] || []) {
      slots.push({
        id: `${d.key}-${t.replace(':', '')}`,
        day: d.key,
        time: t,
        level: 'misto',
        modality,
        coach: d.key === 'sab' ? 'Coach Bia' : COACH_MAP[t] || 'Coach Rafa',
        capacity: d.key === 'sab' ? 20 : CAP_MAP[t] || 12,
        trialQuota: 2,
        override: null,
        special: preset.specials?.[modality] || null,
        closed: false,
      })
    }
  }
  return slots
}

const FIRST = ['Lucas', 'Juliana', 'Pedro', 'Camila', 'Rafael', 'Beatriz', 'Thiago', 'Larissa', 'Gustavo', 'Fernanda', 'Diego', 'Amanda', 'Bruno', 'Patrícia', 'Felipe', 'Carolina', 'Rodrigo', 'Aline', 'Vinícius', 'Natália', 'André', 'Letícia', 'Marcelo', 'Gabriela', 'Henrique', 'Isabela', 'Leonardo', 'Mariana', 'Eduardo', 'Priscila', 'Caio', 'Tatiane', 'Murilo', 'Renata', 'Otávio', 'Bianca', 'Samuel', 'Vanessa']
const LAST = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Martins', 'Rocha', 'Gomes']

export function buildPeople() {
  const r = mulberry32(42)
  const people = {
    [ME_ID]: {
      id: ME_ID,
      name: 'Marina Costa',
      phone: '(11) 98888-1234',
      role: 'aluno',
      plan: '3x',
      extraCredits: 0,
      total: 0,
      early: 0,
      lunch: 0,
      night: 0,
      week: 0,
      weeksInRow: 0,
      mondays: 0,
      fridays: 0,
      saturdays: 0,
      referrals: 0,
      streak: 0,
      monthCount: 0,
      monthNoShows: 0,
      badges: [],
      since: '2026-11-03',
      lastVisitDays: null,
      // mensalidade venceu ontem (quarta 11/11): na quinta ela está em carência, treinando normalmente
      dueDate: '2026-11-11',
    },
  }
  FIRST.forEach((f, i) => {
    const id = `p${i + 1}`
    const total = Math.floor(r() * 140) + 3
    people[id] = {
      id,
      name: `${f} ${LAST[Math.floor(r() * LAST.length)]}`,
      phone: `(11) 9${Math.floor(1000 + r() * 8999)}-${Math.floor(1000 + r() * 8999)}`,
      role: 'aluno',
      plan: ['2x', '3x', 'ilimitado'][Math.floor(r() * 3)],
      extraCredits: 0,
      total,
      early: Math.floor(r() * 30),
      week: 0,
      referrals: r() > 0.8 ? 1 : 0,
      streak: Math.floor(r() * 12),
      monthCount: Math.floor(r() * 18) + 1,
      monthNoShows: Math.floor(r() * 4),
      badges: [],
      since: '2025-0' + (1 + Math.floor(r() * 9)) + '-10',
      lastVisitDays: Math.floor(r() * 4),
      // sem usar r() para não alterar a sequência aleatória do restante da demo
      dueDate: `2026-${i % 2 ? '12' : '11'}-${String(14 + ((i * 5) % 14)).padStart(2, '0')}`,
    }
  })
  // Situação financeira de demonstração: 2 em carência e 2 bloqueados por inadimplência
  people.p3.dueDate = '2026-11-10'
  people.p9.dueDate = '2026-11-11'
  people.p14.dueDate = '2026-11-04'
  people.p26.dueDate = '2026-11-01'
  // Alunos em risco de evasão (inativos > 7 dias ou faltas consecutivas)
  const risk = [
    ['p5', 12, 0],
    ['p11', 9, 1],
    ['p17', 3, 3],
    ['p22', 15, 0],
    ['p28', 8, 2],
    ['p33', 2, 4],
  ]
  for (const [id, days, consec] of risk) {
    people[id].lastVisitDays = days
    people[id].consecutiveNoShows = consec
    people[id].monthCount = Math.max(1, Math.floor(people[id].monthCount / 3))
    people[id].streak = 0
  }
  // contadores por horário / dia da semana (determinísticos — não consomem r() para manter a demo estável)
  Object.values(people).forEach((p, i) => {
    if (p.id === ME_ID) return
    const t = p.total
    p.lunch = (i * 7) % Math.max(1, Math.min(25, Math.floor(t / 4)))
    p.night = (i * 11) % Math.max(1, Math.min(30, Math.floor(t / 3)))
    p.mondays = Math.min(12, (i * 3) % 9)
    p.fridays = Math.min(12, (i * 5) % 8)
    p.saturdays = Math.min(10, (i * 2) % 6)
    p.weeksInRow = Math.floor(p.streak / 3)
  })
  // badges coerentes com o histórico
  Object.values(people).forEach((p) => {
    if (p.id === ME_ID) return
    p.badges = BADGES.filter((b) => b.metric !== 'week' && (p[b.metric] || 0) >= b.goal).map((b) => b.id)
    if (p.streak >= 8) p.badges.push('ritmo', 'semana')
  })
  return people
}

// Reservas da semana corrente (de hoje em diante)
export function buildBookings(slots, people) {
  const r = mulberry32(7)
  const ids = Object.keys(people).filter((id) => id !== ME_ID)
  const bookings = []
  let n = 1
  for (const s of slots) {
    if (['seg', 'ter', 'qua'].includes(s.day)) continue // dias passados vão para o histórico
    let fill = Math.floor(s.capacity * (0.35 + r() * 0.5))
    if (s.id === 'qui-1830') fill = s.capacity // turma lotada para demonstrar lista de espera
    if (s.id === 'qui-0600') fill = 8
    const pool = [...ids].sort(() => r() - 0.5).slice(0, fill)
    for (const pid of pool) {
      bookings.push({
        id: `b${n++}`,
        slotId: s.id,
        personId: pid,
        type: r() > 0.6 ? 'recorrente' : 'avulso',
        status: 'reservado',
        source: r() > 0.55 ? 'whatsapp' : 'web',
        checkin: null,
        confirmed: false,
      })
    }
  }
  // Uma aula experimental pré-existente com PAR-Q, para o coach ver em destaque
  const vid = 'v1'
  people[vid] = {
    id: vid,
    name: 'Roberta Mendes',
    phone: '(11) 97777-2020',
    role: 'visitante',
    plan: null,
    total: 0,
    badges: [],
    parq: { injuries: 'Dor lombar leve (2024), já liberada pelo médico', experience: 'Musculação 1 ano, nunca fez CrossFit' },
  }
  bookings.push({ id: `b${n++}`, slotId: 'qui-0600', personId: vid, type: 'experimental', status: 'reservado', source: 'whatsapp', checkin: null })
  return bookings
}

// Histórico das últimas semanas para o dashboard (aulas encerradas)
export function buildHistory(slots) {
  const r = mulberry32(2026)
  const records = []
  const noShowBase = { '06:00': 0.05, '07:00': 0.07, '08:00': 0.09, '12:10': 0.17, '16:30': 0.11, '17:30': 0.1, '18:30': 0.14, '19:30': 0.12 }
  const coachAdj = { 'Coach Rafa': -0.02, 'Coach Bia': 0, 'Coach Léo': 0.03 }
  const start = new Date('2026-10-12T12:00:00')
  const end = new Date('2026-11-11T12:00:00')
  const keys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = keys[d.getDay()]
    if (k === 'dom') continue
    const iso = d.toISOString().slice(0, 10)
    for (const s of slots.filter((x) => x.day === k)) {
      const booked = Math.max(3, Math.round(s.capacity * (0.55 + r() * 0.42)))
      const cancelled = Math.round(booked * (0.04 + r() * 0.08))
      const rate = Math.max(0.01, (noShowBase[s.time] ?? 0.1) + (coachAdj[s.coach] ?? 0) + (r() - 0.5) * 0.06 + (k === 'sex' ? 0.04 : 0) + (k === 'seg' ? -0.02 : 0))
      const noshow = Math.round((booked - cancelled) * rate)
      records.push({
        date: iso,
        day: k,
        time: s.time,
        coach: s.coach,
        slotId: s.id,
        booked,
        cancelled,
        noshow,
        present: booked - cancelled - noshow,
      })
    }
  }
  return records
}

export const TRIAL_FUNNEL_HISTORY = [
  // por data: agendados, compareceram, matricularam
  ...Array.from({ length: 30 }, (_, i) => {
    const r = mulberry32(100 + i)
    const d = new Date('2026-10-12T12:00:00')
    d.setDate(d.getDate() + i)
    if (d.getDay() === 0) return null
    const scheduled = Math.floor(r() * 3) + (r() > 0.6 ? 1 : 0)
    const attended = Math.max(0, scheduled - (r() > 0.7 ? 1 : 0))
    const converted = attended > 0 && r() > 0.55 ? 1 : 0
    return { date: d.toISOString().slice(0, 10), scheduled, attended, converted }
  }).filter(Boolean),
]

// pinned = comunicado oficial fixado no topo do mural
// eventDate = quando acontece (o mural mostra em destaque); date = quando foi publicado
// highlight = tag curta de destaque ("Horário especial", "20 vagas"…)
export function buildNotices() {
  return [
    {
      id: 'n1',
      title: 'Feriado 20/11 (sexta) — Consciência Negra',
      body: 'Funcionaremos apenas às 07:00 e 08:00 com WOD especial em dupla. Demais horários cancelados. Reservas já feitas serão migradas automaticamente.',
      category: 'feriado',
      pinned: true,
      eventDate: '2026-11-20',
      highlight: 'Horário especial',
      date: '2026-11-10',
      author: 'Coach Rafa',
      whatsappSent: true,
      sentTo: 64,
    },
    {
      id: 'n2',
      title: 'Aulão de Sábado — 14/11 às 08:00',
      body: 'Partner WOD aberto a todos os níveis! Traga um amigo: convidados não pagam e ganham uma aula experimental. 20 vagas.',
      category: 'aulao',
      pinned: true,
      eventDate: '2026-11-14',
      highlight: 'Traga um amigo',
      date: '2026-11-09',
      author: 'Coach Bia',
      whatsappSent: false,
    },
    {
      id: 'n5',
      title: 'Desafio Interno de Novembro: 1.000 Burpees',
      body: 'Some burpees ao longo do mês e registre na lousa depois de cada aula. Quem fechar 1.000 até 30/11 ganha o selo do desafio e concorre a uma camiseta do box.',
      category: 'desafio',
      pinned: true,
      eventDate: '2026-11-30',
      highlight: 'Vale prêmio',
      date: '2026-11-02',
      author: 'Coach Léo',
      whatsappSent: false,
    },
    {
      id: 'n3',
      title: 'Içara Throwdown — 28/11',
      body: 'Inscrições abertas para o campeonato interno nas categorias Iniciante, Scaled e RX. Valor: R$ 60 com camiseta. Inscrição na recepção ou pelo WhatsApp.',
      category: 'evento',
      pinned: false,
      eventDate: '2026-11-28',
      date: '2026-11-05',
      author: 'Coach Léo',
      whatsappSent: false,
    },
    {
      id: 'n4',
      title: 'Manutenção dos remos (Rowers)',
      body: 'Dois remos estarão em manutenção até 16/11. Os WODs com Row terão opção de Bike ou Run.',
      category: 'geral',
      pinned: false,
      date: '2026-11-04',
      author: 'Coach Rafa',
      whatsappSent: false,
    },
  ]
}

// Datas de nascimento (só dia/mês aparecem para os alunos; o ano fica restrito à gestão)
export function seedBirthdays(people, bookings) {
  const r = mulberry32(99)
  const pad = (n) => String(n).padStart(2, '0')
  for (const p of Object.values(people)) {
    if (p.role !== 'aluno') continue
    const year = 1975 + Math.floor(r() * 30)
    p.birth = `${year}-${pad(1 + Math.floor(r() * 12))}-${pad(1 + Math.floor(r() * 28))}`
  }
  people.me.birth = '1994-03-21'
  // Aniversariantes de novembro para a demo: 2 hoje (com aula reservada), outros ao longo do mês
  const bookedOn = (slotId) => bookings.filter((b) => b.slotId === slotId && b.status === 'reservado' && people[b.personId]?.role === 'aluno').map((b) => b.personId)
  const today = [bookedOn('qui-0600')[0], bookedOn('qui-1830')[1]]
  today.forEach((id) => (people[id].birth = people[id].birth.slice(0, 4) + '-11-12'))
  const others = Object.keys(people).filter((id) => id.startsWith('p') && !today.includes(id))
  ;[['-11-03', 2], ['-11-08', 9], ['-11-13', 14], ['-11-21', 20], ['-11-27', 25]].forEach(([md, i]) => (people[others[i]].birth = people[others[i]].birth.slice(0, 4) + md))
}

// Stories de exemplo (sem foto real: fundo da marca + emoji). Em produção a foto vai para o Supabase Storage.
export function buildStories() {
  return [
    { id: 'st1', author: 'Coach Rafa', day: 'qua', min: 20 * 60 + 40, caption: 'Turma das 19:30 voando hoje! 3 PRs de deadlift 🔥', emoji: '🏋️', image: null },
    { id: 'st2', author: 'Coach Bia', day: 'qui', min: 5 * 60 + 20, caption: 'Box aberto e café passado. Bora começar o dia! ☕', emoji: '☀️', image: null },
  ]
}
