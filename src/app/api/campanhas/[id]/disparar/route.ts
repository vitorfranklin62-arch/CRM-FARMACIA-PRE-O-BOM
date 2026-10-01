import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { chamarWebhookN8n } from "@/lib/n8n";

/**
 * POST /api/campanhas/:id/disparar
 * Botão "Disparar agora" em Campanhas. Marca a campanha como agendada pra
 * agora e avisa o N8N, que busca os clientes e envia via UAIZAP/WhatsApp.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireDona();
  const { id } = await params;

  const supabase = await createClient();
  const { data: campanha, error: campanhaError } = await supabase
    .from("campanhas")
    .select("id, status")
    .eq("id", id)
    .single();

  if (campanhaError || !campanha) {
    return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  }

  if (campanha.status === "enviada") {
    return NextResponse.json({ error: "Essa campanha já foi enviada." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("campanhas")
    .update({ status: "agendada", agendada_para: now })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Não foi possível disparar a campanha." }, { status: 500 });
  }

  await logAudit(supabase, "campanha_disparada", "campanhas", id, undefined, usuario.id);

  // Best-effort — se o N8N não responder agora, o schedule trigger dele pega a campanha depois
  await chamarWebhookN8n("integracao_n8n_campanha_webhook_url", { campanha_id: id });

  return NextResponse.json({ ok: true });
}
