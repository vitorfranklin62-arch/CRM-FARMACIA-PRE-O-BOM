import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidarSite } from "@/lib/site-revalidate";

/**
 * POST /api/vitrine/revalidar
 * Chamado pelo painel (client-side) depois de qualquer alteração na vitrine
 * — avisa o site público pra atualizar a página na hora. Existe como rota
 * separada porque as escritas em vitrine_itens acontecem direto do
 * navegador (via RLS), sem passar por uma server action.
 */
export async function POST() {
  await requireDona();
  const supabase = await createClient();
  await revalidarSite(supabase);
  return NextResponse.json({ ok: true });
}
