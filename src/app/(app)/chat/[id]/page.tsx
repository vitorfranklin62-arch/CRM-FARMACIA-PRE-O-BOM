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
  const usuario = await requireUser();
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
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Chat ao vivo</h1>
        <p className="text-sm text-gray-500">Acompanhe e intervenha nas conversas com clientes.</p>
      </div>
      <ChatShell conversas={(conversasRes.data as ConversaCompleta[]) ?? []} selectedId={id}>
        <MessageThread
          conversa={conversaRes.data as ConversaCompleta}
          initialMensagens={(mensagensRes.data as MensagemComUsuario[]) ?? []}
          templates={(templatesRes.data as TemplateMensagem[]) ?? []}
          currentUserId={usuario.id}
        />
      </ChatShell>
    </div>
  );
}
