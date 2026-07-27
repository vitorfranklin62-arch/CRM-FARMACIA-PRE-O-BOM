import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationList } from "./ConversationList";
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
  return (
    <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:h-[calc(100vh-7rem)]">
      <div className={cn("w-full max-w-xs shrink-0 border-r border-gray-100 md:block", selectedId ? "hidden" : "block")}>
        <div className="border-b border-gray-100 px-4 py-3.5">
          <h2 className="text-sm font-semibold text-gray-900">Conversas</h2>
        </div>
        <ConversationList conversas={conversas} selectedId={selectedId} />
      </div>
      <div className={cn("flex-1 md:flex md:flex-col", selectedId ? "flex flex-col" : "hidden")}>
        {children ?? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-300">
            <MessageCircle size={40} />
            <p className="text-sm text-gray-400">Selecione uma conversa</p>
          </div>
        )}
      </div>
    </div>
  );
}
