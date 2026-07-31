import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { clienteWebhookSchema } from "@/lib/validation";
import { normalizarTelefone } from "@/lib/telefone";

/**
 * POST /api/webhooks/cliente
 * Chamado pelo N8N ao identificar um novo contato (ou interação) no WhatsApp/Instagram.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = clienteWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido.", detalhes: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { nome, telefone, origem_chat } = parsed.data;
  const telefoneNormalizado = normalizarTelefone(telefone);

  const { data: existente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefone", telefoneNormalizado)
    .maybeSingle();

  if (existente) {
    const { error } = await supabase
      .from("clientes")
      .update({ nome, origem_chat: origem_chat ?? null, ultima_interacao: now })
      .eq("id", existente.id);

    if (error) return NextResponse.json({ error: "Não foi possível atualizar o cliente." }, { status: 500 });
    return NextResponse.json({ id: existente.id, criado: false }, { status: 200 });
  }

  const { data: novo, error } = await supabase
    .from("clientes")
    .insert({ nome, telefone: telefoneNormalizado, origem_chat: origem_chat ?? null, ultima_interacao: now })
    .select("id")
    .single();

  if (error || !novo) {
    return NextResponse.json({ error: "Não foi possível criar o cliente." }, { status: 500 });
  }

  return NextResponse.json({ id: novo.id, criado: true }, { status: 201 });
}
