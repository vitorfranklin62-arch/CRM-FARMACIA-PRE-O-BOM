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
  const { nome, telefone, origem_chat, foto_url } = parsed.data;
  const telefoneNormalizado = normalizarTelefone(telefone);

  // Upsert atômico por telefone (trava `clientes_telefone_key` no banco) —
  // evita a corrida onde duas chamadas quase simultâneas pro mesmo telefone
  // (ex.: duas mensagens seguidas do cliente) cada uma achava "não existe"
  // e criava um cliente duplicado. foto_url só entra quando vier preenchida,
  // pra uma chamada sem foto não apagar a que já tinha.
  const { data: cliente, error } = await supabase
    .from("clientes")
    .upsert(
      {
        telefone: telefoneNormalizado,
        nome,
        origem_chat: origem_chat ?? null,
        ultima_interacao: now,
        ...(foto_url ? { foto_url } : {}),
      },
      { onConflict: "telefone" }
    )
    .select("id")
    .single();

  if (error || !cliente) {
    return NextResponse.json({ error: "Não foi possível registrar o cliente." }, { status: 500 });
  }

  return NextResponse.json({ id: cliente.id }, { status: 200 });
}
