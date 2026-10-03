import type { ConversaStatus } from "@/types/database";

/**
 * Decide qual status a conversa deve ter depois de registrar uma mensagem
 * pelo webhook. Devolve `null` quando o status atual deve ser mantido.
 *
 * - Se o N8N mandou `conversa_status` explícito, ele vale.
 * - Resposta de funcionária (inclusive a dada direto pelo celular da farmácia)
 *   trava a conversa: um humano assumiu e a IA não deve responder por cima.
 * - Mensagem do cliente ou da IA nunca destrava sozinha uma conversa travada —
 *   só o botão do Chat destrava. Antes, qualquer mensagem reabria a conversa
 *   ("aberta") e a trava sumia no mesmo instante.
 * - Nos demais casos a conversa fica/volta "aberta" (reabre se estava fechada).
 */
export function decidirStatusConversa(params: {
  explicito?: ConversaStatus | null;
  remetente: "ia" | "cliente" | "funcionaria";
  statusAtual?: ConversaStatus | null;
}): ConversaStatus | null {
  if (params.explicito) return params.explicito;
  if (params.remetente === "funcionaria") return "aguardando_humano";
  if (params.statusAtual === "aguardando_humano") return null;
  return "aberta";
}
