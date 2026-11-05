import { NextResponse } from "next/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { tarefaWebhookSchema } from "@/lib/validation";
import { clienteDoTelefone } from "@/lib/ia/cliente";

/**
 * POST /api/webhooks/tarefa — o N8N (ou outra integração) abre uma tarefa.
 * Mesmo Bearer dos outros webhooks. Com `chave_dedup`, nunca abre duas tarefas
 * abertas pro mesmo problema; responde `criada: false` com a existente.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request, { limit: 60, windowMs: 60_000 });
  if (unauthorized) return unauthorized;

  const parsed = tarefaWebhookSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido.", detalhes: parsed.error.flatten() }, { status: 400 });
  }
  const { telefone_cliente, ...t } = parsed.data;
  const cliente = telefone_cliente ? await clienteDoTelefone(telefone_cliente) : null;

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("abrir_tarefa", {
    p: { ...t, origem: "ia", cliente_id: cliente?.id ?? null, ator: "ia" },
  });
  if (error) return NextResponse.json({ error: "Não foi possível abrir a tarefa.", detalhe: error.message }, { status: 500 });
  return NextResponse.json(data, { status: data?.criada ? 201 : 200 });
}
