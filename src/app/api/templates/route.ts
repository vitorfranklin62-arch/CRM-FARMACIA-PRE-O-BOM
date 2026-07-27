import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";

/**
 * GET /api/templates
 * Consultado pelo N8N para buscar as respostas prontas cadastradas pela dona.
 */
export async function GET(request: Request) {
  const unauthorized = authorizeWebhook(request, { limit: 120, windowMs: 60_000 });
  if (unauthorized) return unauthorized;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("templates_mensagem")
    .select("id, titulo, conteudo, categoria")
    .order("titulo");

  if (error) {
    return NextResponse.json({ error: "Não foi possível buscar os templates." }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}
