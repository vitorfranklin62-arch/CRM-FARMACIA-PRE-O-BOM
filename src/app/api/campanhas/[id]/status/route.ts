import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { campanhaStatusWebhookSchema } from "@/lib/validation";

/**
 * POST /api/campanhas/:id/status
 * Chamado pelo N8N para confirmar que uma campanha foi enviada (ou atualizar seu status).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = authorizeWebhook(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID de campanha inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = campanhaStatusWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido.", detalhes: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();
  const update: { status: typeof parsed.data.status; enviada_em?: string } = { status: parsed.data.status };
  if (parsed.data.status === "enviada") update.enviada_em = new Date().toISOString();

  const { error } = await supabase.from("campanhas").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Não foi possível atualizar a campanha." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
