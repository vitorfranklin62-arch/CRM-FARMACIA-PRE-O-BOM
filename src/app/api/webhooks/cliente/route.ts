import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { clienteWebhookSchema } from "@/lib/validation";
import { lerCorpo } from "@/lib/api";
import { registrarClienteWebhook } from "@/lib/clientes-webhook";

/**
 * POST /api/webhooks/cliente
 * Chamado pelo N8N ao identificar um novo contato (ou interação) no WhatsApp/Instagram.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request);
  if (unauthorized) return unauthorized;

  const corpo = await lerCorpo(request, clienteWebhookSchema, { comDetalhes: true });
  if (corpo.resposta) return corpo.resposta;
  const dados = corpo.dados;

  const supabase = createServiceClient();
  const resultado = await registrarClienteWebhook(supabase, dados, new Date().toISOString());
  if (resultado.resposta) return resultado.resposta;

  return NextResponse.json({ id: resultado.clienteId }, { status: 200 });
}
