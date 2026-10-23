import { NextResponse } from "next/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { processarCampanhas } from "@/lib/campanhas/disparo";

/**
 * POST /api/campanhas/processar
 * Batida do agendador (fluxo "tick-campanhas" do N8N, a cada 2 minutos):
 * sincroniza os lotes com a uazapi e cria o próximo quando for a hora.
 * Autenticado com o mesmo N8N_WEBHOOK_SECRET dos outros webhooks.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request, { limit: 30, windowMs: 60_000 });
  if (unauthorized) return unauthorized;

  const resultado = await processarCampanhas();
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
