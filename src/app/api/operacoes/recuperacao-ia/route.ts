import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { recuperacaoManualSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/operacoes/recuperacao-ia — botões do painel Operações (só a dona).
 * { simular: true }                   → mostra quantas conversas seriam reativadas
 * { simular: false, confirmar: true } → reativa agora (mesma regra das 22h:
 *                                        número bloqueado e trava manual ficam)
 */
export async function POST(request: Request) {
  const dona = await requireDona();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = recuperacaoManualSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { simular, confirmar } = parsed.data;
  if (!simular && confirmar !== true) {
    return NextResponse.json({ error: "Confirme a reativação antes de executar." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("recuperar_atendimentos_ia", {
    p_origem: "manual",
    p_simular: simular,
    p_ator: `usuario:${dona.id}`,
  });
  if (error) {
    const semMigracao = /function .*recuperar_atendimentos_ia|PGRST202/i.test(`${error.code} ${error.message}`);
    return NextResponse.json(
      {
        error: semMigracao
          ? "A rotina ainda não existe no banco: rode a migração supabase/migrations/20261105_ia_estado_e_recuperacao_22h.sql."
          : "A verificação falhou.",
        detalhe: error.message,
      },
      { status: 500 }
    );
  }
  if (!simular) {
    await logAudit(supabase, "ia_recuperacao_executada", "conversas", null, (data ?? {}) as Record<string, unknown>, dona.id);
  }
  return NextResponse.json(data);
}
