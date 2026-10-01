import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { campanhaStatusWebhookSchema } from "@/lib/validation";
import { lerCorpo, ehUuid } from "@/lib/api";

/**
 * POST /api/campanhas/:id/status
 * Chamado pelo N8N para confirmar que uma campanha foi enviada (ou atualizar seu status).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = authorizeWebhook(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ error: "ID de campanha inválido." }, { status: 400 });
  }

  const corpo = await lerCorpo(request, campanhaStatusWebhookSchema, { comDetalhes: true });
  if (corpo.resposta) return corpo.resposta;
  const { status } = corpo.dados;

  const supabase = createServiceClient();
  const update: { status: typeof status; enviada_em?: string } = { status };
  if (status === "enviada") update.enviada_em = new Date().toISOString();

  const { error } = await supabase.from("campanhas").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Não foi possível atualizar a campanha." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
