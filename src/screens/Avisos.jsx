import { useState } from "react";
import { CalendarDays, MessageCircle, Pin, Sparkles } from "lucide-react";
import { DAYS, fmtDate } from "../lib/constants";
import { sortNotices } from "../lib/store";
import { Chip } from "../components/ui";
import { BirthdaysCard } from "../components/Birthdays";

export const CATS = {
  aulao: {
    label: "Aulão",
    emoji: "💪",
    cls: "bg-accent/15 text-highlight",
    bar: "bg-accent",
  },
  feriado: {
    label: "Feriado",
    emoji: "📅",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
  },
  desafio: {
    label: "Desafio Interno",
    emoji: "🔥",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  evento: {
    label: "Evento",
    emoji: "🏆",
    cls: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    bar: "bg-fuchsia-500",
  },
  geral: {
    label: "Geral",
    emoji: "📣",
    cls: "bg-line-strong/40 text-fg-soft",
    bar: "bg-line-strong",
  },
};

const WEEK = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const weekday = (iso) => WEEK[new Date(`${iso}T12:00:00`).getDay()];
const MONTHS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

// "Hoje", "Amanhã", "Em 8 dias" ou "Encerrado", em relação ao dia simulado da demo
function relDay(iso, todayIso) {
  const d = Math.round(
    (new Date(`${iso}T12:00:00`) - new Date(`${todayIso}T12:00:00`)) / 86400000,
  );
  if (d < 0) return "Encerrado";
  if (d === 0) return "Hoje";
  if (d === 1) return "Amanhã";
  return `Em ${d} dias`;
}

function SentLine({ n }) {
  if (!n.whatsappSent) return null;
  return (
    <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-wa-light">
      <MessageCircle size={11} /> Enviado no WhatsApp
      {n.sentTo != null ? ` para ${n.sentTo} alunos` : ""}
    </p>
  );
}

// Comunicado oficial fixado: bloco de data grande + tag de destaque
export function PinnedCard({ n, today, actions }) {
  const c = CATS[n.category] || CATS.geral;
  const when = n.eventDate || n.date;
  const rel = n.eventDate ? relDay(n.eventDate, today) : null;
  return (
    <article className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-accent/40">
      <div className={`absolute inset-y-0 left-0 w-1 ${c.bar}`} />
      <div className="flex gap-3 p-4 pl-5">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-elevated py-2 ring-1 ring-line">
          <span className="text-[10px] font-bold tracking-wider text-fg-muted">
            {weekday(when)}
          </span>
          <span className="font-display text-2xl font-extrabold leading-none">
            {when.slice(8)}
          </span>
          <span className="text-[10px] font-bold tracking-wider text-highlight">
            {MONTHS[Number(when.slice(5, 7)) - 1]}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.cls}`}
            >
              {c.emoji} {c.label}
            </span>
            {n.highlight && (
              <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-on-accent">
                <Sparkles size={10} /> {n.highlight}
              </span>
            )}
            {rel && (
              <span
                className={`text-[10px] font-semibold ${rel === "Encerrado" ? "text-fg-subtle" : "text-highlight"}`}
              >
                {rel}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 font-display text-lg font-bold leading-tight">
            {n.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">{n.body}</p>
          <p className="mt-2 text-[10px] text-fg-subtle">
            Publicado em {fmtDate(n.date)} • {n.author}
          </p>
          <SentLine n={n} />
        </div>
      </div>
      {actions && <div className="px-4 pb-4">{actions}</div>}
    </article>
  );
}

export function NoticeCard({ n, actions }) {
  const c = CATS[n.category] || CATS.geral;
  return (
    <article className="rounded-2xl bg-card/60 p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.cls}`}
        >
          {c.emoji} {c.label}
        </span>
        {n.eventDate && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-fg-soft">
            <CalendarDays size={11} /> {fmtDate(n.eventDate)}
          </span>
        )}
        <span className="ml-auto text-[10px] text-fg-subtle">
          {fmtDate(n.date)} • {n.author}
        </span>
      </div>
      <h3 className="font-display text-xl font-bold leading-tight">
        {n.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{n.body}</p>
      <SentLine n={n} />
      {actions}
    </article>
  );
}

export default function Avisos({ db }) {
  const [cat, setCat] = useState("all");
  const today = DAYS.find((d) => d.key === db.now.day).date;
  const all = sortNotices(db.notices);
  const pinned = all.filter((n) => n.pinned);
  const rest = all.filter(
    (n) => !n.pinned && (cat === "all" || n.category === cat),
  );
  return (
    <div className="px-5 pb-6 pt-4">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide">
        Mural do Box
      </h1>
      <p className="text-sm text-fg-muted">Comunicados oficiais dos coaches</p>

      {pinned.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-highlight">
            <Pin size={12} className="fill-highlight" /> Comunicados oficiais
          </h2>
          <div className="space-y-3">
            {pinned.map((n) => (
              <PinnedCard key={n.id} n={n} today={today} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-5">
        <BirthdaysCard db={db} />
      </div>

      <h2 className="mt-5 text-xs font-bold uppercase tracking-wider text-fg-muted">
        Outros avisos
      </h2>
      <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          Todos
        </Chip>
        {Object.entries(CATS).map(([k, v]) => (
          <Chip key={k} active={cat === k} onClick={() => setCat(k)}>
            {v.label}
          </Chip>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {rest.map((n) => (
          <NoticeCard key={n.id} n={n} />
        ))}
        {!rest.length && (
          <p className="py-8 text-center text-sm text-fg-subtle">
            Nenhum outro aviso nesta categoria.
          </p>
        )}
      </div>
    </div>
  );
}
