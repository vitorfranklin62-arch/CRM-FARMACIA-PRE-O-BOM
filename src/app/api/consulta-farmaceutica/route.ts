import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getUsuarioApi } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { consultaFarmaceuticaSchema } from "@/lib/validation";
import { perguntarIa, ConsultaFarmaceuticaError } from "@/lib/ia";

/**
 * POST /api/consulta-farmaceutica
 * Widget flutuante interno "Vitória AI" — pergunta de contraindicação/
 * genérico feita pela equipe. Nunca é chamado pela IA que atende cliente no
 * WhatsApp (que roda no N8N, sem relação com essa rota); é uma ferramenta
 * separada, só para uso da equipe logada.
 */
// Sem esse teto a função serverless é morta no timeout padrão da plataforma
// (10-15s): ela devolve HTML de erro, o `res.json()` do widget quebra e a
// bolha fica travada em "digitando...". Uma consulta lenta cabe folgada aqui.
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request) {
  // `getUsuarioApi` devolve null em vez de redirecionar: numa rota de API o
  // redirect viraria HTML de login e o front quebraria no `res.json()`.
  const usuario = await getUsuarioApi();
  if (!usuario) {
    return NextResponse.json({ error: "Sessão expirada. Faça login de novo." }, { status: 401 });
  }

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
    // salvo, `perguntarIa` cai no prompt padrão embutido no código.
    const { data: configPrompt } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "vitoria_ia_prompt")
      .maybeSingle();

    const resposta = await perguntarIa(parsed.data.pergunta, configPrompt?.valor);

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
    if (error instanceof ConsultaFarmaceuticaError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof OpenAI.AuthenticationError) {
      return NextResponse.json({ error: "Configuração da IA inválida no servidor." }, { status: 500 });
    }
    if (error instanceof OpenAI.RateLimitError) {
      return NextResponse.json({ error: "Muitas consultas agora. Tente novamente em instantes." }, { status: 429 });
    }
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json({ error: "Não foi possível consultar a IA agora." }, { status: 502 });
    }
    return NextResponse.json({ error: "Erro inesperado ao consultar a IA." }, { status: 500 });
  }
}
