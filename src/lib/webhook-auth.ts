import { NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Valida o header `Authorization: Bearer <token>` contra N8N_WEBHOOK_SECRET
 * e aplica rate limiting por IP. Usar no início de toda rota de webhook.
 */
export function authorizeWebhook(
  request: Request,
  { limit = 60, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): NextResponse | null {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook não configurado no servidor." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || token !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const ip = getClientIp(request);
  const path = new URL(request.url).pathname;
  const result = rateLimit(`webhook:${path}:${ip}`, { limit, windowMs });

  if (!result.success) {
    return NextResponse.json({ error: "Muitas requisições. Tente novamente em instantes." }, { status: 429 });
  }

  return null;
}
