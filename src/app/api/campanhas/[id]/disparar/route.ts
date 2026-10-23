import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { processarCampanhas } from "@/lib/campanhas/disparo";

/**
 * POST /api/campanhas/:id/disparar
 * Botão "Disparar agora" em Campanhas. Marca a campanha como agendada pra
 * agora (também serve pra RETOMAR uma campanha pausada — quem já recebeu não
 * recebe de novo) e roda uma rodada do disparo na hora, que entrega o
 * primeiro lote pra fila de campanhas da uazapi (ou retoma o lote pausado).
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
    .update({ status: "agendada", agendada_para: now, motivo_pausa: null })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Não foi possível disparar a campanha." }, { status: 500 });
  }

  await logAudit(supabase, "campanha_disparada", "campanhas", id, undefined, usuario.id);

  // Fora da janela de horário ou com outro lote rodando, a rodada só registra
  // o motivo e a campanha sai na próxima batida do agendador.
  const rodada = await processarCampanhas();
  return NextResponse.json({ ok: true, acoes: rodada.acoes });
}
