import { MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationList } from "./ConversationList";
import { MesclarConversasButton } from "./MesclarConversasButton";
import type { ConversaCompleta } from "@/types/relations";

export function ChatShell({
  conversas,
  selectedId,
  children,
}: {
  conversas: ConversaCompleta[];
  selectedId?: string;
  children?: React.ReactNode;
}) {
  // Quantas conversas estão esperando alguém da farmácia responder.
  const aguardando = conversas.filter((c) => c.status === "aguardando_humano").length;

  return (
    <div className="relative flex h-[calc(100vh-15rem)] overflow-hidden rounded-2xl border border-white/60 bg-white/85 shadow-card-md backdrop-blur-sm dark:border-white/10 dark:bg-navy-800/60 md:h-[calc(100vh-13.5rem)]">
      <span aria-hidden className="faixa-arcoiris absolute inset-x-0 top-0 z-10 h-1" />

      <div
        className={cn(
          "w-full max-w-xs shrink-0 border-r border-brand-100/70 bg-gradient-to-b from-brand-50/60 to-transparent dark:border-white/10 dark:from-brand-500/10 md:block",
          selectedId ? "hidden" : "block"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-brand-100/70 px-4 pb-3.5 pt-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="titulo-gradiente text-sm font-bold">Conversas</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {aguardando > 0 ? (
                <span className="font-semibold text-accent-600 dark:text-accent-300">
                  {aguardando} esperando você
                </span>
              ) : (
                "tudo em dia por aqui"
              )}
            </p>
          </div>
          <MesclarConversasButton />
        </div>
        <ConversationList conversas={conversas} selectedId={selectedId} />
      </div>

      <div className={cn("flex-1 md:flex md:flex-col", selectedId ? "flex flex-col" : "hidden")}>
        {children ?? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradiente-marca text-white shadow-brilho-marca">
              <MessageCircle size={30} />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Selecione uma conversa</p>
            <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <Sparkles size={13} className="text-accent-400" />
              A Vitória continua respondendo enquanto isso
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
