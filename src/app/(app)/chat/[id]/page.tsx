import { MessagesSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatShell } from "@/components/chat/ChatShell";
import { MessageThread } from "@/components/chat/MessageThread";
import type { ConversaCompleta, MensagemComUsuario } from "@/types/relations";
import type { TemplateMensagem } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ChatConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();

  const conversasRes = await supabase
    .from("conversas")
    .select("*, clientes(*)")
    .order("atualizado_em", { ascending: false })
    .limit(100);
  const conversaRes = await supabase.from("conversas").select("*, clientes(*)").eq("id", id).maybeSingle();
  const mensagensRes = await supabase
    .from("mensagens")
    .select("*, usuarios(*)")
    .eq("conversa_id", id)
    .order("criado_em", { ascending: true });
  const templatesRes = await supabase.from("templates_mensagem").select("*").order("titulo");

  if (!conversaRes.data) notFound();

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
      <ChatShell conversas={(conversasRes.data as ConversaCompleta[]) ?? []} selectedId={id}>
        <MessageThread
          conversa={conversaRes.data as ConversaCompleta}
          initialMensagens={(mensagensRes.data as MensagemComUsuario[]) ?? []}
          templates={(templatesRes.data as TemplateMensagem[]) ?? []}
        />
      </ChatShell>
    </div>
  );
}
