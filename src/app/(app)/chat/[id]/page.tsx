import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/chat/MessageThread";
import type { ResumoPedidosCliente } from "@/components/chat/FichaCliente";
import type { ConversaCompleta } from "@/types/relations";
import type { Tag, TemplateMensagem } from "@/types/database";

export const dynamic = "force-dynamic";

// Mesmo join usado na tela de Clientes — traz as tags junto pra aparecerem
// no cabeçalho do Chat sem precisar de outra consulta.
const CLIENTE_COM_TAGS_SELECT = "*, cliente_tags(cliente_id, tag_id, criado_em, tags(*))";

/**
 * Painel da conversa. O servidor monta só o cabeçalho e a ficha do cliente;
 * as mensagens são carregadas no navegador (useMensagens), em páginas, e
 * chegam ao vivo pelo Realtime. A lista de conversas e o zerar das não lidas
 * ficam no layout (ChatShell / ChatRealtimeProvider).
 */
export default async function ChatConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();

  const [conversaRes, templatesRes, tagsRes] = await Promise.all([
    supabase.from("conversas").select(`*, clientes(${CLIENTE_COM_TAGS_SELECT})`).eq("id", id).maybeSingle(),
    supabase.from("templates_mensagem").select("*").order("titulo"),
    supabase.from("tags").select("*").order("nome"),
  ]);

  if (!conversaRes.data) notFound();

  // Resumo de compras pra ficha do cliente (Pedidos / Já gastou / Último pedido).
  const conversa = conversaRes.data as ConversaCompleta;
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("total, criado_em")
    .eq("cliente_id", conversa.cliente_id)
    .order("criado_em", { ascending: false });
  const resumoPedidos: ResumoPedidosCliente = {
    quantidade: pedidos?.length ?? 0,
    totalGasto: (pedidos ?? []).reduce((soma, p) => soma + Number(p.total ?? 0), 0),
    ultimoPedidoEm: pedidos?.[0]?.criado_em ?? null,
  };

  return (
    <MessageThread
      key={conversa.id}
      conversa={conversa}
      templates={(templatesRes.data as TemplateMensagem[]) ?? []}
      tagsDisponiveis={(tagsRes.data as Tag[]) ?? []}
      resumoPedidos={resumoPedidos}
    />
  );
}
