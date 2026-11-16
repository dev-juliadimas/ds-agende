# DS Agende • Box de CrossFit

Protótipo interativo da Double S Tech para boxes de CrossFit. A plataforma web (mobile-first) e o bot de WhatsApp usam a mesma base de dados.

```bash
npm install
npm run dev     # http://localhost:5173
```

## Publicar o site (grátis)

O DS Agende é um **site**, não um app de loja. O aluno abre pelo link e, se quiser, usa *Adicionar à tela inicial* para ter um ícone no celular sem instalar nada. Ícone, nome e prévia do link no WhatsApp já estão configurados.

### Publicado agora — GitHub Pages

O site está em **https://dev-juliadimas.github.io/ds-agende/**. Cada `git push` na branch `main` publica sozinho uma nova versão (workflow em `.github/workflows/deploy.yml`). O acompanhamento fica na aba *Actions* do repositório.

### Opção 1 — Netlify Drop (mais rápida, sem Git)

```bash
npm run build
```

1. Acesse **app.netlify.com/drop** e entre (ou crie uma conta grátis).
2. Arraste a pasta **`dist`** para a página.
3. Em segundos sai um endereço `https://nome-aleatorio.netlify.app`. Ele pode ser renomeado em *Site configuration → Change site name*, por exemplo `dsagende-icaracross.netlify.app`.

Para atualizar o site, rode `npm run build` de novo e arraste a nova pasta `dist` em *Deploys*.

### Opção 2 — GitHub + Netlify ou Vercel (atualiza sozinho a cada alteração)

1. Suba o projeto para um repositório no GitHub.
2. Na Netlify (*Add new site → Import from Git*) ou na Vercel (*Add New → Project*), escolha o repositório. As configurações já estão em `netlify.toml` e `vercel.json`.
3. Cada alteração enviada ao GitHub publica uma nova versão. Nesse modo, a imagem de prévia do link no WhatsApp já sai com o endereço completo.

> Pela Opção 1, para a prévia do link aparecer no WhatsApp, gere o build com o endereço do site:
> `SITE_URL=https://dsagende-icaracross.netlify.app npm run build`

### Custos e observações
- **Hospedagem:** os planos gratuitos da Netlify e da Vercel atendem bem um box. **Domínio próprio** (ex.: `agende.icaracross.com.br`) é opcional e pago à parte, no Registro.br.
- **HTTPS** vem automático. Ele é obrigatório para o check-in por localização funcionar no celular.
- **Esta versão é a demonstração.** Os dados ficam no navegador de cada pessoa e voltam ao início ao recarregar. Para alunos reais usarem, o próximo passo é ligar ao Supabase (`supabase/schema.sql`), que tem plano gratuito para começar.
- **Check-in por proximidade:** num site, o aviso "Fazer check-in?" aparece quando o aluno abre a página perto do box. Ele não chega com o site fechado, como num app instalado. A solução é o bot mandar no WhatsApp, no horário da aula, o link "Cheguei no box".

## Roteiro de demonstração (≈5 min)

O jeito mais fácil de apresentar é pelo botão **🎯 Guia de Testes (Demo)** na barra superior. Ele lista as 8 funções principais, explica o que cada uma resolve para o box, dá o passo a passo e tem o botão **Ir para essa tela**.

O relógio da demo começa na **Quinta 12/11, 05:50**. Dá para mudar o dia, a hora e o GPS na barra superior.

1. **WhatsApp → "oi" → Reservar aula → QUI → 06:00.** A reserva aparece na hora na grade do app (10/12, "Inscrito") e no painel *Supabase Realtime*.
2. **Coach/Gestão → Turmas → Exibir QR da turma.** O QR muda a cada 30 s e só vale durante a aula.
3. **Agenda → Escanear QR → Simular leitura.** O selo 🏅 **Primeiro WOD** é desbloqueado, o card dos Stories fica disponível e o aviso também chega no WhatsApp.
4. **Agenda → QUI 18:30 (lotada) → Entrar na lista de espera.** Depois, em **Coach → Turmas → 18:30**, toque em ➖ num aluno. A vaga passa automaticamente para a Marina e ela recebe aviso no WhatsApp.
5. **WhatsApp → "Visitante novo" → Aula experimental.** Informe nome, horário, acompanhante e PAR-Q. A ficha aparece em destaque na turma do coach.
6. **Coach → Capacidade:** edite a capacidade fixa, a cota de experimentais e o ajuste só desta data.
   Em **Venda avulsa**, escolha *Só horários vazios* e defina o limite de ocupação (padrão 70%). Acima dele, a aula aparece com 🔒 **Venda bloqueada** para aula experimental, drop-in e treino extra via Pix, no app e no WhatsApp. Alunos matriculados continuam reservando. Cada horário aceita exceção: *Seguir regra*, *Sempre vender* ou *Bloquear venda*.
7. **Coach → Turmas → Encerrar aula.** Reservas e check-ins são cruzados, e o resultado vai para **Métricas** (filtro *Hoje*).
8. **Métricas:** veja os KPIs de no-show por dia, horário e coach, o funil de experimentais, o risco de evasão (com botão "Resgatar" pelo WhatsApp), o histórico individual e a exportação em CSV.
9. **WhatsApp → "Simular lembrete 20:00"** mostra o lembrete anti-falta com os botões *Confirmar* e *Liberar vaga*.
10. **Planos:** a Marina começa *Em carência* (venceu 11/11, carência de 3 dias), e a Agenda mostra o aviso. Toque em *Pagar agora* e escolha **Pix**, **Cartão** ou **Pagar na recepção**. Na recepção, a baixa é feita em **Gestão → Financeiro** (Dinheiro ou Maquininha).
11. **Bloqueio por inadimplência:** ative uma reserva fixa, depois em **Planos → Demo: 🔒 Bloqueado**. As reservas futuras são liberadas para a lista de espera e a Agenda e o bot recusam novas reservas. Ao pagar, a reserva fixa volta sozinha. Também dá para reduzir a carência em **Financeiro**.
12. **Pré-reserva de 15 min:** em **Drop-in** (ou num treino extra, quando o limite do plano acabar), pague com Pix ou Cartão. A vaga fica segura com um contador. *Simular 15 min sem pagar* devolve a vaga para a grade.
13. **WhatsApp → 💳 Mensalidade:** mostra a situação e cobra por Pix, link de cartão ou recepção.
14. **Gestão → Bot & Custos:** liga e desliga cada disparo ativo (lembrete, lista de espera, cobrança, aviso urgente, selo, resgate) com a estimativa mensal de custo da Meta. Respostas a quem chamou o bot primeiro são sempre grátis.
15. **Métricas → Alunos sumidos:** *Chamar* abre o **WhatsApp do próprio coach** já com a mensagem (sem custo) ou envia pelo **bot oficial**.

## Arquitetura

```
┌──────────────────────┐        ┌─────────────────────────────┐
│ Web App (React +     │  RPC   │ Supabase (PostgreSQL)       │
│ Tailwind, PWA)       ├───────►│  • book_class / cancel_...  │◄──── Realtime (bookings,
│  Aluno • Coach •     │◄───────┤  • checkin_qr / close_...   │      sessions, notices)
│  Gestor              │realtime│  • triggers de selos        │
└──────────────────────┘        │  • views de métricas        │
                                │  • whatsapp_outbox (fila)   │
┌──────────────────────┐ webhook└──────────┬──────────────────┘
│ WhatsApp (Evolution  ├──────► Edge Function `bot` ─ mesmas RPCs
│ API / Cloud API)     │◄────── Edge Function `outbox` (cron: lembretes 20h,
└──────────────────────┘        selos, lista de espera, resgate, alertas urgentes)
                                 Edge Function `create_charge` → gateway (Pix/Cartão)
                                 webhook do gateway → `confirm_payment`
                                 pg_cron: `enforce_billing` (diário), `expire_holds` (1 min)
```

- **Uma única regra de negócio.** Capacidade, cota de experimentais, limite do plano, antecedência de cancelamento e lista de espera ficam em RPCs do Postgres (`supabase/schema.sql`). A web e o bot chamam as mesmas funções, então nenhum canal consegue "furar" a regra do outro.
- **Bloqueio da vaga em tempo real.** `book_class` usa `SELECT … FOR UPDATE` na sessão. Assim não há overbooking quando o app e o WhatsApp disputam a última vaga.
- **Grade fixa × exceção.** `schedule_slots` guarda a grade semanal. `class_sessions.capacity_override` guarda o ajuste de uma data sem mexer na grade.
- **Presença real.** O QR usa tokens com validade (`checkin_tokens`). O GPS compara o raio (50 m) e a janela (±15 min) no cliente e valida de novo no servidor. O coach tem backup manual.
- **Classificação automática.** `close_session` marca quem reservou e não fez check-in como `falta`. Os cancelamentos dentro do prazo já estão como `cancelado`.
- **Financeiro.** `billing_status()` calcula *em dia / carência / bloqueado* a partir de `people.due_date` e `boxes.grace_days`. O job `enforce_billing` bloqueia, libera as vagas futuras e avisa no WhatsApp (se o disparo estiver ligado). `confirm_payment` renova o vencimento e reativa a reserva fixa. Aula avulsa paga online entra como `pre_reserva` e `expire_holds` devolve a vaga após 15 min. O gateway ainda não foi escolhido: a tabela `payments` e as funções ficam genéricas, e só a Edge Function `create_charge` muda conforme o provedor.
- **Custos Meta.** Cada disparo ativo tem uma chave em `boxes.dispatch_*`. Só entra na `whatsapp_outbox` o que estiver ligado.
- **LGPD.** O PAR-Q fica em `health_forms`, separado, com RLS que só deixa coach e dono lerem. O consentimento é registrado em `consent_at`.

### No protótipo

`src/lib/store.js` simula o Supabase: um store em memória com as mesmas funções das RPCs, mais um log de eventos realtime. `src/lib/bot.js` é o motor de conversa que, em produção, roda na Edge Function do webhook. Para ligar ao Supabase de verdade, troque o corpo de cada ação do store por `supabase.rpc(...)` e assine os canais realtime.

### Estrutura

```
src/
  lib/constants.js   configuração do box, níveis, selos, planos
  lib/seed.js        dados de demonstração e histórico de 30 dias
  lib/store.js       "banco" + regras (espelho das RPCs)
  lib/bot.js         máquina de estados do bot de WhatsApp
  screens/           Agenda, Avisos, Conquistas, Planos (mensalidade), WhatsApp
  screens/coach/     Turmas (QR, chamada, PAR-Q), Capacidade, Financeiro, Métricas, Bot & Custos, Avisos
  components/        Checkout (Pix/Cartão/Recepção), DemoGuide (Guia de Testes)
supabase/schema.sql  tabelas, RPCs, triggers, views, realtime
```

---
Desenvolvido por **Double S Tech** • DS Agende
