"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Bot, User, Headset, FileText, Camera, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime, maskPhone } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { TemplatePicker } from "./TemplatePicker";
import type { ConversaCompleta, MensagemComUsuario } from "@/types/relations";
import type { TemplateMensagem } from "@/types/database";

// Cada remetente tem sua própria cor: a IA em violeta claro, o cliente no azul
// da marca e a equipe em verde. Assim dá pra ler a conversa só pelas cores.
const REMETENTE_STYLE = {
  ia: {
    align: "justify-start",
    bubble:
      "rounded-bl-md bg-gradient-to-br from-violet-50 to-brand-50 text-gray-900 ring-1 ring-inset ring-violet-200/70 dark:from-violet-500/15 dark:to-brand-500/10 dark:text-gray-100 dark:ring-violet-400/20",
    icon: Bot,
    label: "IA",
  },
  cliente: {
    align: "justify-start",
    bubble: "rounded-bl-md bg-gradiente-marca text-white shadow-brilho-marca",
    icon: User,
    label: "Cliente",
  },
  funcionaria: {
    align: "justify-end",
    bubble: "rounded-br-md bg-gradiente-sucesso text-white shadow-brilho-sucesso",
    icon: Headset,
    label: "Você",
  },
} as const;

export function MessageThread({
  conversa,
  initialMensagens,
  templates,
}: {
  conversa: ConversaCompleta;
  initialMensagens: MensagemComUsuario[];
  templates: TemplateMensagem[];
}) {
  const [mensagens, setMensagens] = useState(initialMensagens);
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => setMensagens(initialMensagens), [initialMensagens]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`mensagens-${conversa.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `conversa_id=eq.${conversa.id}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversa.id, router]);

  async function sendMessage(conteudo: string) {
    const trimmed = conteudo.trim();
    if (!trimmed || sending) return;

    setSending(true);
    const res = await fetch("/api/chat/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversa_id: conversa.id, conteudo: trimmed }),
    });

    if (res.ok) {
      setTexto("");
      router.refresh();
    }
    setSending(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-brand-100/70 bg-gradient-to-r from-brand-50/80 via-white to-accent-50/50 px-5 py-3.5 dark:border-white/10 dark:from-brand-500/15 dark:via-navy-800/40 dark:to-accent-500/10">
        <Avatar nome={conversa.clientes?.nome ?? "?"} fotoUrl={conversa.clientes?.foto_url} size={38} comAnel />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{conversa.clientes?.nome ?? "Cliente"}</p>
          <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            {conversa.clientes?.origem_chat === "instagram" ? (
              <Camera size={11} className="text-fuchsia-500 dark:text-fuchsia-400" />
            ) : (
              <MessageSquare size={11} className="text-emerald-500 dark:text-emerald-400" />
            )}
            {maskPhone(conversa.clientes?.telefone)}
          </p>
        </div>
        <Badge
          variant={conversa.status === "fechada" ? "gray" : conversa.status === "aguardando_humano" ? "yellow" : "blue"}
          comBolinha
          pulsando={conversa.status === "aguardando_humano"}
        >
          {conversa.status === "aberta" ? "IA ativa" : conversa.status === "aguardando_humano" ? "Precisa de você" : "Fechada"}
        </Badge>
      </div>

      <div className="rolagem-fina flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-transparent via-brand-50/25 to-accent-50/25 px-5 py-4 dark:via-brand-500/[0.06] dark:to-accent-500/[0.05]">
        {mensagens.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Sem mensagens ainda.</p>
        )}
        {mensagens.map((msg) => {
          const style = REMETENTE_STYLE[msg.remetente];
          const Icon = style.icon;
          return (
            <div key={msg.id} className={cn("flex", style.align)}>
              <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2.5 transition", style.bubble)}>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] opacity-70">
                  <Icon size={11} />
                  {msg.remetente === "funcionaria" && msg.usuarios ? msg.usuarios.nome : style.label}
                </div>
                <p className="whitespace-pre-wrap text-sm">{msg.conteudo}</p>
                <p className="mt-1 text-[10px] opacity-60">{formatDateTime(msg.criado_em)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-brand-100/70 bg-gradient-to-r from-brand-50/50 via-white to-accent-50/40 p-3 dark:border-white/10 dark:from-brand-500/10 dark:via-navy-800/40 dark:to-accent-500/10">
        {showTemplates && (
          <TemplatePicker
            templates={templates}
            onSelect={(conteudo) => {
              setTexto(conteudo);
              setShowTemplates(false);
            }}
            onClose={() => setShowTemplates(false)}
          />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(texto);
          }}
          className="flex items-end gap-2"
        >
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            title="Usar template"
            className="rounded-xl p-2.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-white/10"
          >
            <FileText size={18} />
          </button>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(texto);
              }
            }}
            rows={1}
            placeholder="Digite uma mensagem..."
            className="flex-1 resize-none rounded-xl border border-brand-200/80 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-brand-500/25"
          />
          <button
            type="submit"
            disabled={sending || !texto.trim()}
            className="rounded-xl bg-gradiente-acento p-2.5 text-white shadow-brilho-acento transition hover:brightness-110 disabled:bg-none disabled:bg-accent-200 disabled:shadow-none"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
