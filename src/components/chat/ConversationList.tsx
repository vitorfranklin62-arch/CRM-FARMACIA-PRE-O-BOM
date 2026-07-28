"use client";

import Link from "next/link";
import { MessageSquare, Camera } from "lucide-react";
import { cn, formatRelativeTime, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
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

export function ConversationList({
  conversas,
  selectedId,
}: {
  conversas: ConversaCompleta[];
  selectedId?: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {conversas.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Nenhuma conversa ainda.</p>
      )}
      {conversas.map((conversa) => (
        <Link
          key={conversa.id}
          href={`/chat/${conversa.id}`}
          className={cn(
            "flex items-start gap-3 border-b border-gray-50 px-4 py-3 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5",
            selectedId === conversa.id && "bg-brand-50 hover:bg-brand-50 dark:bg-brand-500/15 dark:hover:bg-brand-500/15"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {initials(conversa.clientes?.nome ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {conversa.clientes?.nome ?? "Cliente"}
              </p>
              <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                {formatRelativeTime(conversa.atualizado_em)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {conversa.clientes?.origem_chat === "instagram" ? (
                <Camera size={12} className="text-gray-400 dark:text-gray-500" />
              ) : (
                <MessageSquare size={12} className="text-gray-400 dark:text-gray-500" />
              )}
              <Badge variant={STATUS_VARIANT[conversa.status]} className="text-[10px]">
                {STATUS_LABEL[conversa.status]}
              </Badge>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
