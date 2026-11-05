import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tarefaCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/** POST /api/tarefas — alguém da equipe cria uma tarefa à mão. */
export async function POST(request: Request) {
  const usuario = await requireUser();
  const parsed = tarefaCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas")
    .insert({ ...parsed.data, origem: "manual", criado_por: usuario.id })
    .select("id, numero")
    .single();
  if (error || !data) return NextResponse.json({ error: "Não foi possível criar a tarefa." }, { status: 500 });

  await logAudit(supabase, "tarefa_criada", "tarefas", data.id, { numero: data.numero, categoria: parsed.data.categoria });
  return NextResponse.json(data, { status: 201 });
}
