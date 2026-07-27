import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditAcao, Database } from "@/types/database";

/**
 * Audit log básico: registra quem fez o quê. Best-effort — uma falha ao
 * gravar a auditoria nunca deve interromper a ação principal do usuário.
 */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  acao: AuditAcao,
  entidade: string,
  entidadeId?: string | null,
  detalhes?: Record<string, unknown>,
  /** Necessário quando `supabase` é um client de service role (sem sessão) — nesse caso não há como descobrir o ator via auth.getUser(). */
  actorId?: string
): Promise<void> {
  try {
    const usuarioId = actorId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

    await supabase.from("audit_log").insert({
      usuario_id: usuarioId,
      acao,
      entidade,
      entidade_id: entidadeId ?? null,
      detalhes: detalhes ?? null,
    });
  } catch {
    // auditoria é best-effort — nunca bloquear a ação do usuário por causa dela
  }
}
