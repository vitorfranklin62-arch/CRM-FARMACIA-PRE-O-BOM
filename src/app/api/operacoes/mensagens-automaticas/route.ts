import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mensagemAutomaticaUpdateSchema } from "@/lib/validation";
import { validarTemplate } from "@/lib/mensagens/template";
import { logAudit } from "@/lib/audit";

/**
 * PUT /api/operacoes/mensagens-automaticas — a dona edita o texto ou
 * liga/desliga uma mensagem automática. O texto é validado (só variáveis
 * conhecidas) antes de gravar, pra cliente nunca receber "{nome_errado}".
 */
export async function PUT(request: Request) {
  const dona = await requireDona();
  const parsed = mensagemAutomaticaUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { chave, conteudo, ativo } = parsed.data;

  if (conteudo !== undefined) {
    const v = validarTemplate(chave, conteudo);
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mensagens_automaticas")
    .update({
      ...(conteudo !== undefined ? { conteudo: conteudo.trim() } : {}),
      ...(ativo !== undefined ? { ativo } : {}),
      atualizado_por: dona.id,
    })
    .eq("chave", chave)
    .select("chave, conteudo, ativo, atualizado_em")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });

  await logAudit(supabase, "mensagens_automaticas_atualizadas", "mensagens_automaticas", null, {
    chave,
    ...(ativo !== undefined ? { ativo } : {}),
    texto_alterado: conteudo !== undefined,
  });
  return NextResponse.json(data);
}
