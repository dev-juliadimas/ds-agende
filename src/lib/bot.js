/*
 * Motor do Bot de WhatsApp. Em produção roda numa Edge Function do Supabase
 * acionada pelo webhook da Evolution API / WhatsApp Cloud API, usando as
 * mesmas RPCs (book, cancel, swap, create_trial...) que a plataforma web.
 */
import { BOX, DAYS, HOLD_MINUTES, LEVELS, ME_ID, PLANS, WEEKDAY_TIMES, brl, dayByKey, dayIndex, fmtDate } from './constants'
import {
  sortNotices,
  botSay,
  book,
  cancel,
  confirmPresence,
  createDropin,
  createTrial,
  getState,
  joinWaitlist,
  salesStatus,
  myBookings,
  setChatCtx,
  setChatPerson,
  setRecurrence,
  slotById,
  slotCounts,
  slotStatus,
  swap,
  userSay,
  fmtHours,
  bookingWindow,
  billingStatus,
  confirmPayment,
  priceOf,
  monthlyDue,
  startCheckout,
} from './store'

const norm = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const MENU_ME = [
  { label: '📅 Horários livres', value: 'horarios' },
  { label: '✅ Reservar aula', value: 'reservar' },
  { label: '🗂️ Minhas reservas', value: 'minhas' },
  { label: '🔁 Reserva fixa', value: 'recorrente' },
  { label: '🤝 Levar um amigo', value: 'experimental' },
  { label: '💳 Mensalidade', value: 'pagar' },
  { label: '📢 Avisos', value: 'avisos' },
]
const MENU_VISITOR = [
  { label: '📅 Horários livres', value: 'horarios' },
  { label: '🆓 Aula experimental', value: 'experimental' },
  { label: '🌎 Drop-in (sou de outro box)', value: 'dropin' },
  { label: '🗂️ Minha reserva', value: 'minhas' },
  { label: '📢 Avisos', value: 'avisos' },
]

const upcomingDays = () => {
  const s = getState()
  return DAYS.filter((d) => dayIndex(d.key) >= dayIndex(s.now.day))
}
const dayButtons = (prefix) => upcomingDays().map((d) => ({ label: `${d.short} ${d.date.slice(8)}/${d.date.slice(5, 7)}`, value: `${prefix}:${d.key}` }))

function slotLine(slot, forSale = false) {
  const s = getState()
  const c = slotCounts(s, slot.id)
  const lv = LEVELS[slot.level].short
  const full = c.free === 0 ? '🔴 LOTADA' : forSale && !salesStatus(s, slot).open ? '🔒 indisponível p/ visitantes' : `🟢 ${c.free} vaga${c.free > 1 ? 's' : ''}`
  return `*${slot.time}* • ${lv} • ${slot.coach.replace('Coach ', '')} • ${full}`
}

function openSlots(dayKey, filter = () => true) {
  const s = getState()
  return s.slots.filter((x) => x.day === dayKey && slotStatus(s, x) === 'open' && filter(x))
}

const sellable = (x) => salesStatus(getState(), x).open

const pixCode = (id, v) => `00020126580014BR.GOV.BCB.PIX0136dsagende-${id}5204000053039865406${v.toFixed(2)}5802BR`
// Cobrança Pix pelo WhatsApp. Na demo, o botão "Simular Pix pago" faz o papel do webhook do gateway.
function pixMessage(chat, pay, what, hold) {
  return botSay(
    chat,
    `💠 *Pix — ${what}*\nValor: *${brl(pay.amount)}*\n${hold ? `⏳ Vaga pré-reservada por ${HOLD_MINUTES} min até o pagamento.\n` : ''}\nCopia e cola:\n\`${pixCode(pay.id, pay.amount)}\`\n\nAssim que o banco confirmar, eu te aviso aqui. ✅`,
    [{ label: '✅ Simular Pix pago', value: `paid:${pay.id}` }],
  )
}

function menu(chat) {
  const s = getState()
  const c = s.chats[chat]
  const first = c.name.split(' ')[0]
  const isMe = chat === 'me'
  setChatCtx(chat, { step: 'menu' })
  botSay(
    chat,
    isMe
      ? `Olá, ${first}! 👋 Sou o assistente virtual do *${BOX.name}*.\nEscolha uma opção ou digite o número:`
      : `Olá! 👋 Bem-vindo(a) ao *${BOX.name}*.\nSou o assistente virtual e te atendo na hora, 24h.\nEscolha uma opção:`,
    isMe ? MENU_ME : MENU_VISITOR,
  )
}

function pick(chat, text) {
  const s = getState()
  const ctx = s.chats[chat].ctx
  const t = norm(text)
  // números mapeiam para os botões da última mensagem do bot
  const lastBot = [...s.chats[chat].messages].reverse().find((m) => m.from === 'bot' && m.buttons?.length)
  if (/^\d+$/.test(t) && lastBot && lastBot.buttons[Number(t) - 1]) return lastBot.buttons[Number(t) - 1].value
  if (lastBot) {
    const hit = lastBot.buttons.find((b) => norm(b.label).includes(t) && t.length > 2)
    if (hit && !ctx.step?.startsWith('trial_name') && !ctx.step?.endsWith('_text')) return hit.value
  }
  return text
}

export function handleInput(chat, raw, label) {
  userSay(chat, label ?? raw)
  setTimeout(() => respond(chat, raw), 450)
}

function respond(chat, raw) {
  const s = getState()
  const c = s.chats[chat]
  const ctx = c.ctx
  const value = pick(chat, raw)
  const t = norm(value)
  const pid = c.personId

  if (['oi', 'ola', 'menu', 'inicio', '0', 'bom dia', 'boa tarde', 'boa noite', 'voltar'].includes(t) || ctx.step === 'idle') {
    if (ctx.step === 'idle' && !['oi', 'ola', 'menu'].includes(t)) {
      // primeira mensagem livre também abre o menu
    }
    return menu(chat)
  }

  const [cmd, arg, arg2] = value.split(':')

  // ---------- comandos globais (botões) ----------
  if (cmd === 'confirm') {
    confirmPresence(arg)
    return botSay(chat, '💪 Presença confirmada! Te esperamos no box. Chegue 10 min antes para o aquecimento.')
  }
  if (cmd === 'release') {
    const r = cancel(arg, 'whatsapp', { force: true, reason: 'lembrete' })
    return botSay(chat, r.ok ? '✅ Vaga liberada com sucesso! O próximo da lista de espera já foi avisado. Obrigado por avisar 🙏' : `⚠️ ${r.msg}`)
  }
  if (cmd === 'book') {
    const r = book({ slotId: arg, personId: pid, type: 'avulso', source: 'whatsapp' })
    const slot = slotById(getState(), arg)
    if (r.ok) {
      setChatCtx(chat, { step: 'menu' })
      return botSay(chat, `✅ *Reserva confirmada!*\n📅 ${dayByKey(slot.day).label}, ${slot.time}\n🏋️ ${LEVELS[slot.level].label}\n👤 ${slot.coach}\n🔥 WOD: ${getState().wods[slot.day].name}\n\nVocê recebe um lembrete na noite anterior. Digite *menu* para voltar.`)
    }
    if (r.code === 'full')
      return botSay(chat, `😕 A turma das ${slot.time} lotou agora há pouco.`, [
        { label: '⏳ Entrar na lista de espera', value: `wait:${arg}` },
        { label: '📅 Ver outros horários', value: 'reservar' },
      ])
    if (r.code === 'blocked')
      return botSay(chat, `🔒 ${r.msg}`, [
        { label: '💳 Pagar mensalidade', value: 'pagar' },
        { label: '↩️ Menu', value: 'menu' },
      ])
    if (r.code === 'plan' && !sellable(slot))
      return botSay(chat, `⚠️ ${r.msg}\n\n🔒 Este horário está com alta procura e não vende treino extra avulso. Tente um horário mais tranquilo:`, [{ label: '📅 Ver horários', value: 'reservar' }])
    if (r.code === 'plan')
      return botSay(chat, `⚠️ ${r.msg}\n\nVocê pode liberar um treino extra por *${brl(priceOf(getState(), 'extra'))}* via Pix.`, [
        { label: '💠 Gerar Pix', value: `pix:${arg}` },
        { label: '↩️ Menu', value: 'menu' },
      ])
    return botSay(chat, `⚠️ ${r.msg}`)
  }
  if (cmd === 'wait') {
    const r = joinWaitlist(arg, pid, 'whatsapp')
    return botSay(chat, r.ok ? `⏳ Você é o *${r.position}º* da lista de espera. Se alguém liberar a vaga, você entra automaticamente e eu te aviso aqui!` : r.msg)
  }
  if (cmd === 'pix') {
    const r = startCheckout({ kind: 'extra', personId: pid, slotId: arg, method: 'pix', source: 'whatsapp' })
    if (!r.ok) return botSay(chat, `⚠️ ${r.msg}`)
    return pixMessage(chat, r.payment, 'Treino extra', true)
  }
  if (cmd === 'paid') {
    const r = confirmPayment(arg)
    if (!r.ok) return botSay(chat, `⚠️ ${r.msg}`)
    // o recibo de mensalidade já sai pelo disparo de cobrança; para aula avulsa confirmamos aqui
    const pay = getState().payments.find((x) => x.id === arg)
    if (pay.kind !== 'mensalidade' || !getState().settings.dispatches.billing) {
      const b = pay.bookingId && getState().bookings.find((x) => x.id === pay.bookingId)
      const slot = b && slotById(getState(), b.slotId)
      return botSay(chat, `✅ *Pagamento confirmado!* ${brl(pay.amount)}${slot ? `\n📅 Vaga garantida: ${dayByKey(slot.day).label} ${slot.time}` : ''}\nBom treino! 🔥`)
    }
    return
  }
  if (cmd === 'pagar') {
    const st = getState()
    if (!pid || !st.people[pid] || st.people[pid].role !== 'aluno') return botSay(chat, 'Para visitantes, o pagamento é por aula (drop-in). Digite *menu*.')
    const p = st.people[pid]
    const bs = billingStatus(st, pid)
    const head =
      bs.status === 'pago'
        ? `✅ Sua mensalidade está *em dia*. Próximo vencimento: ${fmtDate(bs.due)}.`
        : bs.status === 'carencia'
          ? `⏳ Sua mensalidade venceu em ${fmtDate(bs.due)}. Você está na carência e segue treinando ${bs.left === 0 ? 'só até hoje' : `por mais ${bs.left} dia(s)`}.`
          : `🔒 Seu acesso está *suspenso*: a mensalidade venceu em ${fmtDate(bs.due)}.`
    const due = monthlyDue(st, pid)
    const valor = due.discount ? `Valor: ~${brl(due.price)}~ *${brl(due.total)}*\n🎁 Desconto do Indique e Ganhe: −${brl(due.discount)}` : `Valor: *${brl(due.price)}*`
    return botSay(chat, `💳 *Mensalidade — ${PLANS[p.plan].label}*\n${head}\n${valor}\n\nComo quer pagar?`, [
      { label: '💠 Pix', value: 'paymens:pix' },
      { label: '💳 Cartão (link)', value: 'paymens:cartao' },
      { label: '🏪 Na recepção', value: 'paymens:recepcao' },
    ])
  }
  if (cmd === 'paymens') {
    const r = startCheckout({ kind: 'mensalidade', personId: pid, method: arg, source: 'whatsapp' })
    if (!r.ok) return botSay(chat, `⚠️ ${r.msg}`)
    if (arg === 'pix') return pixMessage(chat, r.payment, 'Mensalidade', false)
    if (arg === 'cartao')
      return botSay(chat, `💳 Link de pagamento seguro (${brl(r.payment.amount)}):\nhttps://pay.dsagende.app/${r.payment.id}\n\n_(Na demo, simule a confirmação do gateway abaixo.)_`, [{ label: '✅ Simular cartão aprovado', value: `paid:${r.payment.id}` }])
    return botSay(chat, `🏪 Combinado! Pague *${brl(r.payment.amount)}* na recepção (dinheiro ou maquininha). Assim que o coach der baixa, sua situação é atualizada aqui.`)
  }
  if (cmd === 'cancel') {
    const r = cancel(arg, 'whatsapp')
    return botSay(chat, r.ok ? '✅ Reserva cancelada e vaga liberada na hora.' : `⚠️ ${r.msg}\n\nSe não puder ir, avise o coach para não contar como falta.`)
  }
  if (cmd === 'swap') {
    const b = getState().bookings.find((x) => x.id === arg)
    const slot = slotById(getState(), b.slotId)
    const opts = openSlots(slot.day, (x) => x.id !== slot.id)
    setChatCtx(chat, { step: 'swap', from: arg })
    return botSay(chat, `🔄 Para qual horário de ${dayByKey(slot.day).label} você quer trocar?\n\n${opts.map(slotLine).join('\n')}`, opts.map((x) => ({ label: x.time, value: `swapto:${arg}:${x.id}` })))
  }
  if (cmd === 'swapto') {
    const r = swap(arg, arg2, 'whatsapp')
    const slot = slotById(getState(), arg2)
    return botSay(chat, r.ok ? `✅ Troca feita! Agora você treina às *${slot.time}*.` : `⚠️ ${r.msg}`)
  }

  // ---------- menus ----------
  if (cmd === 'horarios') {
    setChatCtx(chat, { step: 'h_day' })
    return botSay(chat, '📅 Para qual dia?', dayButtons('hday'))
  }
  if (cmd === 'hday') {
    setChatCtx(chat, { step: 'h_level', day: arg })
    return botSay(chat, 'Qual nível você procura?', [
      { label: 'Todos', value: `hlevel:${arg}:all` },
      ...Object.entries(LEVELS).map(([k, v]) => ({ label: v.short, value: `hlevel:${arg}:${k}` })),
    ])
  }
  if (cmd === 'hlevel') {
    const list = openSlots(arg, (x) => arg2 === 'all' || x.level === arg2)
    if (!list.length) return botSay(chat, 'Nenhum horário aberto com esse filtro. Tente outro dia 😉', dayButtons('hday'))
    const visitor = chat !== 'me'
    const bookable = visitor ? list.filter((x) => sellable(x) && ['iniciante', 'misto'].includes(x.level) && slotCounts(getState(), x.id).free > 0) : list
    return botSay(
      chat,
      `🗓️ *${dayByKey(arg).label}* — WOD *${getState().wods[arg].name}*\n\n${list.map((x) => slotLine(x, visitor)).join('\n')}\n\n${visitor ? (bookable.length ? 'Horários disponíveis para aula experimental:' : 'Nenhum horário deste dia está aberto para visitantes. Tente outro dia 😉') : 'Toque para reservar:'}`,
      bookable.slice(0, 8).map((x) => ({ label: `${visitor ? 'Experimental' : 'Reservar'} ${x.time}`, value: visitor ? `trialslot:${x.id}` : `book:${x.id}` })),
    )
  }
  if (cmd === 'reservar') {
    setChatCtx(chat, { step: 'r_day' })
    return botSay(chat, '✅ Vamos reservar! Qual dia?', dayButtons('rday'))
  }
  if (cmd === 'rday') {
    const first = getState().slots.find((x) => x.day === arg)
    const w = first && bookingWindow(getState(), first)
    if (w && !w.open) return botSay(chat, `🗓️ ${w.msg}`, dayButtons('rday'))
    const list = openSlots(arg)
    return botSay(chat, `Horários de *${dayByKey(arg).label}*:\n\n${list.map(slotLine).join('\n')}`, list.map((x) => ({ label: x.time, value: `book:${x.id}` })))
  }
  if (cmd === 'minhas') {
    if (!pid) return botSay(chat, 'Você ainda não tem reservas. Que tal agendar uma *aula experimental gratuita*?', [{ label: '🆓 Aula experimental', value: 'experimental' }])
    const list = myBookings(getState(), pid).filter((b) => slotStatus(getState(), b.slot) !== 'past')
    if (!list.length) return botSay(chat, 'Você não tem reservas ativas nesta semana.', [{ label: '✅ Reservar aula', value: 'reservar' }])
    const lines = list.map((b, i) => `${i + 1}. ${dayByKey(b.slot.day).short} *${b.slot.time}* • ${LEVELS[b.slot.level].short}${b.status === 'presente' ? ' ✅' : ''}${b.type === 'recorrente' ? ' 🔁' : ''}`)
    const btns = list
      .filter((b) => b.status === 'reservado')
      .slice(0, 4)
      .flatMap((b) => [
        { label: `❌ Cancelar ${b.slot.day.toUpperCase()} ${b.slot.time}`, value: `cancel:${b.id}` },
        ...(chat === 'me' ? [{ label: `🔄 Trocar ${b.slot.day.toUpperCase()} ${b.slot.time}`, value: `swap:${b.id}` }] : []),
      ])
    return botSay(chat, `🗂️ *Suas reservas:*\n${lines.join('\n')}\n\nCancelamento até ${fmtHours(getState().settings.minCancelHours)} antes.`, btns)
  }
  if (cmd === 'recorrente') {
    return botSay(chat, '🔁 *Reserva fixa semanal*\nSua vaga é renovada automaticamente toda semana. Quais dias?', [
      { label: 'Seg / Qua / Sex', value: 'recdays:seg,qua,sex' },
      { label: 'Ter / Qui', value: 'recdays:ter,qui' },
      { label: 'Seg a Sex', value: 'recdays:seg,ter,qua,qui,sex' },
    ])
  }
  if (cmd === 'recdays') {
    return botSay(chat, 'Em qual horário?', WEEKDAY_TIMES.map((x) => ({ label: x, value: `rectime:${arg}:${x}` })))
  }
  if (cmd === 'rectime') {
    const days = arg.split(',')
    const time = `${arg2}:${value.split(':')[3]}`
    const r = setRecurrence(pid, days, time, 'whatsapp')
    const made = r.created.map((x) => dayByKey(x.day).short).join(', ')
    const fail = r.failed.map((f) => `${dayByKey(f.slot.day).short}: ${f.msg}`).join('\n')
    return botSay(chat, `🔁 *Reserva fixa ativada:* ${days.map((d) => dayByKey(d).short).join('/')} às ${time}.\n${made ? `Nesta semana já garanti: ${made}.` : 'Os próximos dias desta semana já passaram — começa na próxima!'}${fail ? `\n\n⚠️ Não reservado:\n${fail}` : ''}`)
  }
  if (cmd === 'avisos') {
    const list = sortNotices(getState().notices).slice(0, 4)
    return botSay(chat, `📢 *Mural do Box*\n\n${list.map((n) => `${n.pinned ? '📌 ' : '• '}*${n.title}*${n.eventDate ? ` — ${fmtDate(n.eventDate)}` : ''}\n${n.body}`).join('\n\n')}`)
  }

  // ---------- aula experimental ----------
  if (cmd === 'experimental') {
    setChatCtx(chat, { step: 'trial_name', data: { referrer: chat === 'me' ? ME_ID : null } })
    return botSay(
      chat,
      chat === 'me'
        ? '🤝 Que legal! Traga um amigo para uma *aula experimental gratuita* e ganhe o selo *Treino em Dupla* quando ele comparecer.\n\nQual o *nome completo* do seu amigo(a)?'
        : '🆓 *Aula experimental gratuita!* Sem burocracia, leva 1 minuto.\n\nQual é o seu *nome completo*?',
    )
  }
  if (ctx.step === 'trial_name' && cmd !== 'trialslot') {
    const data = { ...ctx.data, name: raw.trim() }
    if (data.slotIdPre) {
      setChatCtx(chat, { step: 'trial_comp', data: { ...data, slotId: data.slotIdPre } })
      return botSay(chat, `Prazer, ${data.name.split(' ')[0]}! Vai sozinho(a) ou com acompanhante (cônjuge, amigo)?`, [
        { label: '🙋 Vou sozinho(a)', value: 'comp:no' },
        { label: '👫 Vou com acompanhante', value: 'comp:yes' },
      ])
    }
    setChatCtx(chat, { step: 'trial_slot', data })
    const opts = upcomingDays()
      .flatMap((d) => openSlots(d.key, (x) => ['iniciante', 'misto'].includes(x.level)))
      .filter((x) => {
        const c = slotCounts(getState(), x.id)
        return sellable(x) && c.trials < x.trialQuota && c.free > 0
      })
      .slice(0, 8)
    return botSay(chat, `Prazer, ${data.name.split(' ')[0]}! 😄\nEstes horários são ideais para quem está começando (Iniciante ou Todos os Níveis):`, opts.map((x) => ({ label: `${dayByKey(x.day).short} ${x.time}`, value: `trialslot:${x.id}` })))
  }
  if (cmd === 'trialslot') {
    const data = { ...(ctx.data || {}), slotId: arg }
    if (!data.name) {
      setChatCtx(chat, { step: 'trial_name', data: { slotIdPre: arg } })
      return botSay(chat, 'Ótima escolha! Para reservar sua aula experimental, qual é o seu *nome completo*?')
    }
    setChatCtx(chat, { step: 'trial_comp', data })
    return botSay(chat, 'Vai sozinho(a) ou com acompanhante (cônjuge, amigo)?', [
      { label: '🙋 Vou sozinho(a)', value: 'comp:no' },
      { label: '👫 Vou com acompanhante', value: 'comp:yes' },
    ])
  }
  if (cmd === 'comp') {
    if (arg === 'yes') {
      setChatCtx(chat, { step: 'trial_comp_text', data: ctx.data })
      return botSay(chat, 'Qual o nome do(a) acompanhante?')
    }
    setChatCtx(chat, { step: 'trial_injury_text', data: ctx.data })
    return botSay(chat, '🩺 *Mini ficha de saúde (PAR-Q)*\nTem alguma lesão, dor ou restrição médica? Se não, toque no botão.', [{ label: '✅ Nenhuma lesão', value: 'injury:none' }])
  }
  if (ctx.step === 'trial_comp_text') {
    setChatCtx(chat, { step: 'trial_injury_text', data: { ...ctx.data, companion: raw.trim() } })
    return botSay(chat, '🩺 *Mini ficha de saúde (PAR-Q)*\nTem alguma lesão, dor ou restrição médica? Se não, toque no botão.', [{ label: '✅ Nenhuma lesão', value: 'injury:none' }])
  }
  if (ctx.step === 'trial_injury_text' || cmd === 'injury') {
    const injuries = cmd === 'injury' ? 'Nenhuma' : raw.trim()
    setChatCtx(chat, { step: 'trial_exp', data: { ...ctx.data, injuries } })
    return botSay(chat, 'E sua experiência com atividade física?', [
      { label: 'Sedentário(a)', value: 'exp:Sedentário(a)' },
      { label: 'Treino às vezes', value: 'exp:Treina ocasionalmente' },
      { label: 'Treino regular', value: 'exp:Treina regularmente' },
      { label: 'Já fiz CrossFit', value: 'exp:Já praticou CrossFit' },
    ])
  }
  if (cmd === 'exp' || cmd === 'trialretry') {
    const d = cmd === 'exp' ? { ...ctx.data, experience: arg } : { ...ctx.data, slotId: arg }
    const r = createTrial({
      name: d.name,
      phone: getState().chats[chat].phone,
      slotId: d.slotId,
      companion: d.companion,
      parq: { injuries: d.injuries, experience: d.experience },
      referrerId: d.referrer,
      source: 'whatsapp',
    })
    if (!r.ok) {
      const need = d.companion ? 2 : 1
      const alt = upcomingDays()
        .flatMap((x) => openSlots(x.key, (s) => ['iniciante', 'misto'].includes(s.level)))
        .filter((s) => {
          const c = slotCounts(getState(), s.id)
          return sellable(s) && s.trialQuota - c.trials >= need && c.free >= need
        })
        .slice(0, 6)
      setChatCtx(chat, { step: 'trial_retry', data: d })
      return botSay(chat, `⚠️ ${r.msg}\nSem problema! Estes horários têm vaga para ${need === 2 ? 'vocês dois' : 'você'}:`, alt.map((s) => ({ label: `${dayByKey(s.day).short} ${s.time}`, value: `trialretry:${s.id}` })))
    }
    setChatCtx(chat, { step: 'menu' })
    if (chat === 'visitor') setChatPerson(chat, r.person.id, r.person.name)
    const slot = slotById(getState(), d.slotId)
    return botSay(
      chat,
      `🎉 *Aula experimental confirmada!*\n👤 ${d.name}${d.companion ? ` + ${d.companion}` : ''}\n📅 ${dayByKey(slot.day).label}, ${slot.time} com ${slot.coach}\n📍 ${BOX.address}\n\n👟 Venha com roupa confortável, tênis e garrafinha. Chegue 10 min antes — o coach já sabe das suas informações de saúde.`,
    )
  }

  // ---------- drop-in ----------
  if (cmd === 'dropin') {
    setChatCtx(chat, { step: 'drop_name_text', data: {} })
    return botSay(chat, '🌎 Bem-vindo(a) ao Içara Cross! Drop-in para quem já treina CrossFit.\nQual o seu *nome*?')
  }
  if (ctx.step === 'drop_name_text') {
    setChatCtx(chat, { step: 'drop_box_text', data: { name: raw.trim() } })
    return botSay(chat, 'De qual box/cidade você é?')
  }
  if (ctx.step === 'drop_box_text') {
    setChatCtx(chat, { step: 'drop_exp', data: { ...ctx.data, fromBox: raw.trim() } })
    return botSay(chat, 'Há quanto tempo pratica CrossFit?', [
      { label: '< 1 ano', value: 'dexp:menos de 1 ano' },
      { label: '1–3 anos', value: 'dexp:1–3 anos' },
      { label: '3+ anos', value: 'dexp:mais de 3 anos' },
    ])
  }
  if (cmd === 'dexp') {
    setChatCtx(chat, { step: 'drop_slot', data: { ...ctx.data, experience: arg } })
    const opts = upcomingDays().flatMap((d) => openSlots(d.key)).filter((x) => sellable(x) && slotCounts(getState(), x.id).free > 0).slice(0, 10)
    return botSay(chat, 'Escolha o horário:', opts.map((x) => ({ label: `${dayByKey(x.day).short} ${x.time} ${LEVELS[x.level].short}`, value: `dslot:${x.id}` })))
  }
  if (cmd === 'dslot') {
    const d = ctx.data
    setChatCtx(chat, { step: 'drop_pay', data: { ...d, slotId: arg } })
    return botSay(chat, `Valor do drop-in: *${brl(priceOf(getState(), 'dropin'))}*. Como prefere pagar?`, [
      { label: '💠 Pix agora', value: 'dpay:pix' },
      { label: '🏪 Na recepção', value: 'dpay:recepcao' },
    ])
  }
  if (cmd === 'dpay') {
    const d = ctx.data
    const r = createDropin({ ...d, phone: getState().chats[chat].phone, method: arg, source: 'whatsapp' })
    setChatCtx(chat, { step: 'menu' })
    if (!r.ok) return botSay(chat, `⚠️ ${r.msg}`)
    setChatPerson(chat, r.person.id, r.person.name)
    const slot = slotById(getState(), d.slotId)
    if (arg === 'pix') return pixMessage(chat, r.payment, `Drop-in ${dayByKey(slot.day).short} ${slot.time}`, true)
    return botSay(chat, `✅ *Drop-in reservado!*\n📅 ${dayByKey(slot.day).label} ${slot.time} • ${LEVELS[slot.level].label}\n🏪 Pague ${brl(r.payment.amount)} na recepção ao chegar.\nBom treino! 🔥`)
  }

  // fallback
  botSay(chat, 'Não entendi 🤔 Digite *menu* para ver as opções.')
}
