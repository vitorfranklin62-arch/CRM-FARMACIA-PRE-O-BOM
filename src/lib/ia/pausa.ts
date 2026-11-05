import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { camposPausaPorResposta, minutosDePausa, type MotivoIa } from "@/lib/ia/estado";

/** Chave em `configuracoes` com os minutos de pausa (padrão 10, igual ao N8N). */
export const CHAVE_PAUSA_MINUTOS = "ia_pausa_resposta_humana_minutos";

/**
 * Coluna nova ainda não existe no banco (migração 20261105 não rodada): o
 * PostgREST responde PGRST204 / 42703. Nesse caso a rota cai no comportamento
 * antigo em vez de falhar — publicar o código antes da migração não quebra nada.
 */
function colunaInexistente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === "PGRST204" || erro.code === "42703" || /ia_(pausada_ate|motivo|ator)/.test(erro.message ?? "");
}

type CamposEstado = Database["public"]["Tables"]["conversas"]["Update"];

/**
 * Atualiza o estado da IA numa conversa. Se o banco ainda não tem as colunas
 * ia_* (migração pendente), repete só com os campos antigos — o
 * comportamento anterior continua funcionando.
 */
export async function atualizarEstadoConversa(
  supabase: SupabaseClient<Database>,
  conversaId: string,
  campos: CamposEstado
): Promise<void> {
  const { error } = await supabase.from("conversas").update(campos).eq("id", conversaId);
  if (colunaInexistente(error)) {
    const { ia_pausada_ate, ia_motivo, ia_motivo_em, ia_ator, ia_evento_id, ...antigos } = campos;
    void [ia_pausada_ate, ia_motivo, ia_motivo_em, ia_ator, ia_evento_id];
    if (Object.keys(antigos).length > 0) await supabase.from("conversas").update(antigos).eq("id", conversaId);
  }
}

export async function lerMinutosDePausa(): Promise<number> {
  const service = createServiceClient();
  const { data } = await service.from("configuracoes").select("valor").eq("chave", CHAVE_PAUSA_MINUTOS).maybeSingle();
  return minutosDePausa(data?.valor);
}

/**
 * Alguém da equipe respondeu pelo CRM: a IA pausa por N minutos (renova a cada
 * resposta) e volta sozinha depois. ANTES a conversa ficava travada pra sempre
 * — essa era a principal causa da "IA travando sem motivo".
 * Uma trava sem prazo (botão Travar / transferência da IA) não é encurtada:
 * o banco garante isso (trigger normalizar_estado_ia_conversa).
 */
export async function pausarIaPorRespostaHumana(
  supabase: SupabaseClient<Database>,
  conversaId: string,
  usuarioId: string,
  opcoes: { subirNaLista?: boolean } = {}
): Promise<void> {
  const minutos = await lerMinutosDePausa();
  const agora = new Date();
  const base = opcoes.subirNaLista === false ? {} : { atualizado_em: agora.toISOString() };
  await atualizarEstadoConversa(supabase, conversaId, { ...base, ...camposPausaPorResposta(minutos, `usuario:${usuarioId}`, agora) });
}

/** Trava SEM prazo (fica com a equipe até alguém destravar ou até a rotina das 22h). */
export async function travarIaSemPrazo(
  supabase: SupabaseClient<Database>,
  conversaId: string,
  motivo: Extract<MotivoIa, "manual" | "transferencia_ia" | "nova_conversa_crm">,
  ator: string,
  extras: { atualizado_em?: string; ia_evento_id?: string | null } = {}
): Promise<void> {
  await atualizarEstadoConversa(supabase, conversaId, {
    ...extras,
    status: "aguardando_humano",
    ia_pausada_ate: null,
    ia_motivo: motivo,
    ia_ator: ator,
  });
}
