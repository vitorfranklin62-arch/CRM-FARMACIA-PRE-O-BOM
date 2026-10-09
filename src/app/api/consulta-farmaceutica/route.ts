import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { consultaFarmaceuticaSchema } from "@/lib/validation";
import { PROMPT_PADRAO_VITORIA_IA } from "@/lib/vitoria-prompt";
import { perguntarVitoriaN8n, VitoriaN8nError } from "@/lib/vitoria-n8n";

/**
 * POST /api/consulta-farmaceutica
 * Widget flutuante interno "Vitória AI" — pergunta de contraindicação/
 * genérico feita pela equipe. A resposta vem de um fluxo do N8N próprio
 * (webhook VITORIA-AI-CONSULTA-FARMACIA, ver src/lib/vitoria-n8n.ts), separado
 * da IA que atende cliente no WhatsApp; é uma ferramenta só para a equipe logada.
 */
export async function POST(request: Request) {
  const usuario = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = consultaFarmaceuticaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Escreva uma pergunta de 3 a 500 caracteres." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    // Prompt customizável pela dona (Configurações → Vitória AI); sem valor
    // salvo, usa o prompt padrão embutido no código.
    const { data: configPrompt } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "vitoria_ia_prompt")
      .maybeSingle();

    const resposta = await perguntarVitoriaN8n(parsed.data.pergunta, configPrompt?.valor?.trim() || PROMPT_PADRAO_VITORIA_IA);

    const { data: registro } = await supabase
      .from("consultas_farmaceuticas")
      .insert({ usuario_id: usuario.id, pergunta: parsed.data.pergunta, resposta })
      .select("id, criado_em")
      .single();

    return NextResponse.json({
      resposta,
      id: registro?.id ?? null,
      criado_em: registro?.criado_em ?? new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof VitoriaN8nError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Erro inesperado ao consultar a IA." }, { status: 500 });
  }
}
