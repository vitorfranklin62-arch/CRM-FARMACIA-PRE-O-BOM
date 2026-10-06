import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { normalizarTelefone } from "@/lib/telefone";
import { registrarOptout } from "@/lib/optout";

const schema = z.object({ telefone: z.string().trim().min(8).max(30) });

/**
 * POST /api/webhooks/optout
 * Descadastra um número das campanhas. O fluxo de mensagem recebida do N8N já
 * cai aqui automaticamente via /api/webhooks/mensagem quando o cliente manda
 * "SAIR"; esta rota existe pra chamar direto (ex.: botão externo, outro fluxo).
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const telefone = normalizarTelefone(parsed.data.telefone);
  const { data: cliente } = await createServiceClient()
    .from("clientes")
    .select("id")
    .eq("telefone", telefone)
    .maybeSingle();

  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const { novo } = await registrarOptout(cliente.id, telefone);
  return NextResponse.json({ ok: true, ja_estava_descadastrado: !novo });
}
