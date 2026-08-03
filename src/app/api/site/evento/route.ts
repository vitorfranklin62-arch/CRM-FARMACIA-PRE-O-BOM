import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { siteEventoSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/site/evento
 * Telemetria anônima do site público (clique WhatsApp/iFood, busca). Chamado via
 * sendBeacon/fetch fire-and-forget pelo browser — nunca deve travar a navegação
 * do cliente, então qualquer erro aqui só devolve status, sem detalhar motivo.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`site-evento:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!limited.success) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // produtos de exemplo (fallback offline) não têm uuid real — nesse caso
  // registramos o evento sem produto_id em vez de rejeitar a telemetria.
  if (typeof body.produto_id === "string" && !UUID_RE.test(body.produto_id)) {
    body.produto_id = null;
  }

  const parsed = siteEventoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const supabase = createSupabaseClient<Database>(url, key);
  await supabase.from("site_eventos").insert({
    tipo: parsed.data.tipo,
    produto_id: parsed.data.produto_id ?? null,
    secao: parsed.data.secao ?? null,
    termo: parsed.data.termo ?? null,
  });

  return NextResponse.json({ ok: true });
}
