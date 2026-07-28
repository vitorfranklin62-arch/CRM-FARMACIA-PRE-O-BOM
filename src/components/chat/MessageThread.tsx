"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Bot, User, Headset, FileText, Camera, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime, initials, maskPhone } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { TemplatePicker } from "./TemplatePicker";
import type { ConversaCompleta, MensagemComUsuario } from "@/types/relations";
import type { TemplateMensagem } from "@/types/database";

const REMETENTE_STYLE = {
  ia: { align: "justify-start", bubble: "bg-purple-50 text-purple-900", icon: Bot, label: "IA" },
  cliente: { align: "justify-start", bubble: "bg-gray-100 text-gray-900", icon: User, label: "Cliente" },
  funcionaria: { align: "justify-end", bubble: "bg-blue-600 text-white", icon: Headset, label: "Você" },
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
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
          {initials(conversa.clientes?.nome ?? "?")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{conversa.clientes?.nome ?? "Cliente"}</p>
          <p className="flex items-center gap-1 text-xs text-gray-400">
            {conversa.clientes?.origem_chat === "instagram" ? <Camera size={11} /> : <MessageSquare size={11} />}
            {maskPhone(conversa.clientes?.telefone)}
          </p>
        </div>
        <Badge variant={conversa.status === "fechada" ? "gray" : conversa.status === "aguardando_humano" ? "yellow" : "blue"}>
          {conversa.status === "aberta" ? "IA ativa" : conversa.status === "aguardando_humano" ? "Precisa de você" : "Fechada"}
        </Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {mensagens.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Sem mensagens ainda.</p>}
        {mensagens.map((msg) => {
          const style = REMETENTE_STYLE[msg.remetente];
          const Icon = style.icon;
          return (
            <div key={msg.id} className={cn("flex", style.align)}>
              <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2.5", style.bubble)}>
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

      <div className="border-t border-gray-100 p-3">
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
            className="rounded-lg p-2.5 text-gray-400 transition hover:bg-gray-100 hover:text-blue-600"
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
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={sending || !texto.trim()}
            className="rounded-lg bg-blue-600 p-2.5 text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
