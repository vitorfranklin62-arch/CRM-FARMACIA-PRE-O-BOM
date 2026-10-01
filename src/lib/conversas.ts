import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversaStatus, Database } from "@/types/database";

/**
 * Conversa mais recente do cliente (ou null se ele nunca teve uma). Sempre
 * reaproveita a mais recente, mesmo "fechada" — evita empilhar uma conversa
 * nova a cada novo atendimento do mesmo número.
 */
export async function buscarConversaRecente(
  supabase: SupabaseClient<Database>,
  clienteId: string
): Promise<{ id: string; status: ConversaStatus } | null> {
  const { data } = await supabase
    .from("conversas")
    .select("id, status")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}
