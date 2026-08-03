import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

/**
 * POST /api/revalidate
 * Chamado pelo CRM quando uma promoção muda, pra atualizar a home do site
 * antes dos 5 minutos de cache padrão. Header: Authorization: Bearer <REVALIDATE_SECRET>.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Revalidação não configurada no servidor." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || token !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  revalidateTag("produtos-destaque");
  return NextResponse.json({ revalidated: true, now: Date.now() });
}
