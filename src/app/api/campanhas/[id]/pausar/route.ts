import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { pausarCampanha } from "@/lib/campanhas/disparo";

/**
 * POST /api/campanhas/:id/pausar
 * Botão "Pausar" em Campanhas. Marca a campanha como pausada e para o lote
 * que estiver na fila da uazapi (POST /sender/edit action=stop). Quem já
 * recebeu fica registrado; "Retomar" continua de onde parou.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireDona();
  const { id } = await params;

  const supabase = await createClient();
  const { data: campanha } = await supabase.from("campanhas").select("id, status").eq("id", id).single();
  if (!campanha) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  if (campanha.status !== "agendada") {
    return NextResponse.json({ error: "Só dá pra pausar uma campanha em andamento." }, { status: 409 });
  }

  const { loteParado } = await pausarCampanha(id);
  await logAudit(supabase, "campanha_pausada", "campanhas", id, { lote_parado: loteParado }, usuario.id);

  if (!loteParado) {
    return NextResponse.json({
      ok: true,
      aviso: "A campanha foi pausada, mas a uazapi ainda não confirmou a parada do lote em andamento. O sistema tenta de novo em instantes.",
    });
  }
  return NextResponse.json({ ok: true });
}
