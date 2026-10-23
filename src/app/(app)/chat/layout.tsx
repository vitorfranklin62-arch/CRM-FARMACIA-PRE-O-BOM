import { MessagesSquare } from "lucide-react";
import { ChatShell } from "@/components/chat/ChatShell";

/**
 * A lista de conversas fica no layout: trocar de conversa só troca o painel
 * da direita (a página [id]); a lista, o cache e a conexão ao vivo continuam
 * montados, sem buscar tudo de novo.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {/* Faixa colorida de topo, no mesmo padrão dos quadros de Pedidos e Encomendas. */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500 px-5 py-6 text-white shadow-card-md">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <MessagesSquare size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Chat ao vivo</h1>
            <p className="text-sm text-white/80">Acompanhe e intervenha nas conversas com clientes.</p>
          </div>
        </div>
      </div>
      <ChatShell>{children}</ChatShell>
    </div>
  );
}
