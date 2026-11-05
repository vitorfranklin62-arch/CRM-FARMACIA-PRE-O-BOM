import { NextResponse } from "next/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/automacoes/recuperacao-ia
 * Plano B da rotina das 22h, pra quando o pg_cron não estiver disponível no
 * banco: um fluxo do N8N agendado às 22:00 (America/Bahia) chama esta rota com
 * o mesmo `Authorization: Bearer <N8N_WEBHOOK_SECRET>` dos outros webhooks.
 *
 * Pode ser chamada mais de uma vez no mesmo dia (ex.: pg_cron E N8N ligados):
 * o banco só executa a primeira, as outras respondem `ja_executada: true`.
 * Nunca envia mensagem a cliente — só devolve a IA às conversas.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request, { limit: 10, windowMs: 60_000 });
  if (unauthorized) return unauthorized;

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("recuperar_atendimentos_ia", {
    p_origem: "agendada",
    p_simular: false,
    p_ator: "n8n",
  });
  if (error) {
    return NextResponse.json({ error: "Rotina não executou.", detalhe: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
