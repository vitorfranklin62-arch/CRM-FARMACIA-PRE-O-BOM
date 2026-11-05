import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { avisosPedidoSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/** POST /api/operacoes/avisos-pedido — liga/desliga os avisos automáticos de pedido (só a dona). */
export async function POST(request: Request) {
  const dona = await requireDona();
  const parsed = avisosPedidoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("configuracoes")
    .upsert({ chave: "notificacoes_pedido_ativas", valor: parsed.data.ativo ? "true" : "false", tipo: "boolean" }, { onConflict: "chave" });
  if (error) return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });

  await logAudit(supabase, "notificacoes_pedido_alteradas", "configuracoes", null, { ativo: parsed.data.ativo }, dona.id);
  return NextResponse.json({ ativo: parsed.data.ativo });
}
