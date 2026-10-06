import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/** Compara em tempo constante, pra não vazar o segredo por diferença de tempo de resposta. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Valida o header `Authorization` contra N8N_WEBHOOK_SECRET e aplica rate
 * limiting por IP. Usar no início de toda rota de webhook.
 *
 * Aceita `Bearer <segredo>` (com "Bearer" em qualquer caixa) ou só `<segredo>`.
 * A tolerância existe porque o editor de credenciais do N8N é fácil de errar
 * (tradução automática do navegador troca "Bearer" por "portador", campo em
 * modo expressão, maiúscula/minúscula) — e o que protege a rota é o segredo,
 * não a palavra na frente dele.
 */
export function authorizeWebhook(
  request: Request,
  { limit = 60, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): NextResponse | null {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook não configurado no servidor." }, { status: 500 });
  }

  const authHeader = (request.headers.get("authorization") ?? "").trim();
  const token = authHeader.replace(/^bearer\s+/i, "");

  if (!token || !segredoConfere(token, secret)) {
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
