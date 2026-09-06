"use client";

import Link from "next/link";
import { MessageSquare, Camera } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import type { ConversaCompleta } from "@/types/relations";

const STATUS_VARIANT = {
  aberta: "blue",
  aguardando_humano: "yellow",
  fechada: "gray",
} as const;

const STATUS_LABEL = {
  aberta: "IA ativa",
  aguardando_humano: "Precisa de você",
  fechada: "Fechada",
} as const;

/** Barrinha colorida na lateral do item, na cor do status da conversa. */
const STATUS_BARRA = {
  aberta: "bg-gradient-to-b from-brand-400 to-brand-600",
  aguardando_humano: "bg-gradient-to-b from-amber-400 to-orange-500",
  fechada: "bg-gradient-to-b from-slate-300 to-slate-400",
} as const;

export function ConversationList({
  conversas,
  selectedId,
}: {
  conversas: ConversaCompleta[];
  selectedId?: string;
}) {
  return (
    <div className="rolagem-fina flex h-full flex-col overflow-y-auto">
      {conversas.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Nenhuma conversa ainda.</p>
      )}
      {conversas.map((conversa) => {
        const selecionada = selectedId === conversa.id;
        return (
          <Link
            key={conversa.id}
            href={`/chat/${conversa.id}`}
            className={cn(
              "relative flex items-start gap-3 border-b border-brand-100/50 py-3 pl-5 pr-4 transition hover:bg-brand-50/70 dark:border-white/5 dark:hover:bg-white/5",
              selecionada &&
                "bg-gradient-to-r from-brand-100/90 to-brand-50/30 hover:from-brand-100 dark:from-brand-500/20 dark:to-transparent"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-2 left-1.5 w-1 rounded-full transition-opacity",
                STATUS_BARRA[conversa.status],
                selecionada ? "opacity-100" : "opacity-40"
              )}
            />
            <Avatar
              nome={conversa.clientes?.nome ?? "?"}
              fotoUrl={conversa.clientes?.foto_url}
              size={38}
              comAnel={selecionada}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    "truncate text-sm font-semibold text-gray-900 dark:text-white",
                    selecionada && "text-brand-800 dark:text-brand-100"
                  )}
                >
                  {conversa.clientes?.nome ?? "Cliente"}
                </p>
                <span className="shrink-0 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  {formatRelativeTime(conversa.atualizado_em)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {conversa.clientes?.origem_chat === "instagram" ? (
                  <Camera size={12} className="text-fuchsia-500 dark:text-fuchsia-400" />
                ) : (
                  <MessageSquare size={12} className="text-emerald-500 dark:text-emerald-400" />
                )}
                <Badge
                  variant={STATUS_VARIANT[conversa.status]}
                  className="text-[10px]"
                  comBolinha
                  pulsando={conversa.status === "aguardando_humano"}
                >
                  {STATUS_LABEL[conversa.status]}
                </Badge>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
