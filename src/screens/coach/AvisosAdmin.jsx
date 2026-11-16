import { useState } from "react";
import { MessageCircle, Pin, PinOff, Send, Trash2, Zap } from "lucide-react";
import { DAYS, META_PRICE, brl, dayByKey } from "../../lib/constants";
import {
  addNotice,
  deleteNotice,
  dispatchUrgent,
  noticeRecipients,
  sortNotices,
  toast,
  togglePin,
} from "../../lib/store";
import { Btn, Field, inputCls } from "../../components/ui";
import { CATS, NoticeCard, PinnedCard } from "../Avisos";
import { StoryComposer } from "../../components/Stories";
import { BirthdaysCard } from "../../components/Birthdays";

export default function AvisosAdmin({ db }) {
  const empty = {
    title: "",
    body: "",
    category: "geral",
    pinned: false,
    eventDate: "",
    highlight: "",
    whatsapp: false,
    target: db.now.day,
  };
  const [f, setF] = useState(empty);
  const up = (k) => (e) =>
    setF((x) => ({
      ...x,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));
  const dispatchOn = db.settings.dispatches.urgent;
  const recipients = noticeRecipients(db, f.target).size;
  const estimate = recipients * META_PRICE.utilidade;
  const targetLabel = (t) =>
    t === "todos" ? "todos os alunos" : `inscritos de ${dayByKey(t).label}`;
  const publish = () => {
    if (!f.title.trim()) return toast("Informe o título do aviso", "err");
    const n = addNotice({
      title: f.title.trim(),
      body: f.body.trim(),
      category: f.category,
      pinned: f.pinned,
      eventDate: f.eventDate || undefined,
      highlight: f.highlight.trim() || undefined,
      author: "Coach Rafa",
    });
    if (f.whatsapp) {
      const k = dispatchUrgent(n.id, f.target);
      if (dispatchOn)
        toast(
          `Aviso publicado e enviado no WhatsApp para ${k} ${targetLabel(f.target)}`,
        );
      else
        toast(
          "Aviso publicado só no mural: o disparo de avisos está desligado em Bot & Custos",
          "err",
        );
    } else
      toast(
        f.pinned
          ? "Comunicado fixado no topo do mural"
          : "Aviso publicado no mural",
      );
    setF(empty);
  };
  const list = sortNotices(db.notices);
  const today = dayByKey(db.now.day).date;
  return (
    <div className="space-y-4">
      <StoryComposer db={db} />
      <BirthdaysCard db={db} compact />
      <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <Zap size={13} className="text-highlight" /> Aviso rápido
        </div>
        <input
          className={inputCls}
          placeholder="Título (ex.: Aulão de Sábado às 08:00)"
          value={f.title}
          onChange={up("title")}
        />
        <textarea
          className={inputCls}
          rows={3}
          placeholder="Mensagem"
          value={f.body}
          onChange={up("body")}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Categoria">
            <select
              className={inputCls}
              value={f.category}
              onChange={up("category")}
            >
              {Object.entries(CATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.emoji} {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data do evento" hint="Opcional">
            <input
              type="date"
              className={inputCls}
              value={f.eventDate}
              min={today}
              onChange={up("eventDate")}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.pinned}
            onChange={up("pinned")}
            className="accent-accent"
          />
          <Pin size={14} className="text-highlight" /> Fixar no topo como
          comunicado oficial
        </label>
        {f.pinned && (
          <Field
            label="Tag de destaque"
            hint="Opcional. Aparece em âmbar no card fixado (até 20 letras)."
          >
            <input
              className={inputCls}
              maxLength={20}
              placeholder="Ex.: 20 vagas, Vale prêmio"
              value={f.highlight}
              onChange={up("highlight")}
            />
          </Field>
        )}
        <div
          className={`rounded-xl p-3 ring-1 ${f.whatsapp ? "bg-emerald-500/5 ring-emerald-500/30" : "bg-elevated/50 ring-line"}`}
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.whatsapp}
              onChange={up("whatsapp")}
              className="accent-emerald-600"
            />
            <MessageCircle
              size={14}
              className="text-emerald-700 dark:text-wa-light"
            />
            Disparar também no WhatsApp{" "}
            <span className="text-fg-subtle">(usa crédito Meta)</span>
          </label>
          {f.whatsapp && (
            <div className="mt-3 space-y-2">
              <Field label="Enviar para">
                <select
                  className={inputCls}
                  value={f.target}
                  onChange={up("target")}
                >
                  <option value="todos">Todos os alunos</option>
                  {DAYS.map((d) => (
                    <option key={d.key} value={d.key}>
                      Inscritos de {d.label} ({d.date.slice(8)}/
                      {d.date.slice(5, 7)})
                    </option>
                  ))}
                </select>
              </Field>
              {dispatchOn ? (
                <p className="text-[11px] text-fg-muted">
                  {recipients} destinatários × {brl(META_PRICE.utilidade)} ≈{" "}
                  <b className="text-fg">{brl(estimate)}</b> em mensagens de
                  utilidade. Quem falou com o bot nas últimas 24h recebe sem
                  custo.
                </p>
              ) : (
                <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  O disparo “Aviso urgente” está desligado em Bot & Custos. O
                  aviso vai só para o mural até você ligar.
                </p>
              )}
            </div>
          )}
        </div>
        <Btn className="w-full" onClick={publish}>
          <Send size={16} /> Publicar
          {f.whatsapp && dispatchOn ? " + enviar no WhatsApp" : ""}
        </Btn>
      </div>

      <div className="space-y-3">
        {list.map((n) => {
          const Card = n.pinned ? PinnedCard : NoticeCard;
          return (
            <Card
              key={n.id}
              n={n}
              today={today}
              actions={
                <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                  <Btn
                    variant="dark"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => togglePin(n.id)}
                  >
                    {n.pinned ? <PinOff size={13} /> : <Pin size={13} />}{" "}
                    {n.pinned ? "Desafixar" : "Fixar"}
                  </Btn>
                  <Btn
                    variant="dark"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      if (!dispatchOn)
                        return toast(
                          "O disparo “Aviso urgente” está desligado em Bot & Custos",
                          "err",
                        );
                      const k = dispatchUrgent(n.id, db.now.day);
                      toast(`Enviado para ${k} alunos inscritos hoje`);
                    }}
                  >
                    <MessageCircle size={13} /> WhatsApp hoje
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="ml-auto px-2 py-1.5 text-xs"
                    onClick={() => deleteNotice(n.id)}
                    aria-label="Excluir"
                  >
                    <Trash2 size={14} />
                  </Btn>
                </div>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
