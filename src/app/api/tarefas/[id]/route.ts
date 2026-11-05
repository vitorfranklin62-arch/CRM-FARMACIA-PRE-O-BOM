import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tarefaUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/**
 * PATCH /api/tarefas/:id — muda status, prioridade, responsável, prazo ou
 * observações. O histórico (quem mudou o quê) é gravado pelo banco.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const parsed = tarefaUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("tarefas").update(parsed.data).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível atualizar a tarefa." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  await logAudit(supabase, "tarefa_atualizada", "tarefas", id, { campos: Object.keys(parsed.data), status: parsed.data.status });
  return NextResponse.json(data);
}
