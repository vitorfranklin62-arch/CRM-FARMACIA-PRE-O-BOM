import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

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

  const service = createServiceClient();
  const { data: config } = await service
    .from("configuracoes")
    .select("valor")
    .eq("chave", "integracao_n8n_campanha_webhook_url")
    .maybeSingle();

  const webhookUrl = config?.valor;
  const secret = process.env.N8N_WEBHOOK_SECRET;

  if (webhookUrl && secret) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ campanha_id: id }),
      });
    } catch {
      // Best-effort — se o N8N não responder agora, o schedule trigger dele pega a campanha depois
    }
  }

  return NextResponse.json({ ok: true });
}
