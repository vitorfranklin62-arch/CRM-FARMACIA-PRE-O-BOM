import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { processarCampanhas, registrarRecibo } from "@/lib/campanhas/disparo";

/**
 * POST /api/webhooks/uazapi
 * Recebe direto da uazapi (sem passar pelo N8N) só o que interessa às campanhas:
 *  - `sender`: um lote começou ("sending") ou terminou ("done"). Ao terminar,
 *    já roda a próxima rodada do disparo, sem esperar o agendador.
 *  - `messages_update`: recibos de entrega/leitura (event.MessageIDs + state).
 * Registrado por Configurações → Campanhas → "Ativar acompanhamento".
 *
 * A uazapi não assina a entrega; o que prova a origem é o `token` da
 * instância que vem no corpo de todo evento — conferido contra
 * UAIZAP_API_KEY. Responde rápido: a uazapi não reenvia entrega que falhou.
 */

function tokenConfere(recebido: unknown): boolean {
  const esperado = process.env.UAIZAP_API_KEY?.trim();
  if (!esperado || typeof recebido !== "string") return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  const limite = rateLimit(`webhook:uazapi:${getClientIp(request)}`, { limit: 600, windowMs: 60_000 });
  if (!limite.success) return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });

  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > 512 * 1024) return NextResponse.json({ error: "Payload grande demais." }, { status: 413 });

  let corpo: Record<string, unknown> | null;
  try {
    corpo = objeto(await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!corpo || !tokenConfere(corpo.token)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const tipo = String(corpo.EventType ?? "");

  if (tipo === "messages_update") {
    const evento = objeto(corpo.event);
    // Só recibos de conversa individual de mensagens NOSSAS (campanha sai pela própria instância).
    if (corpo.type === "ReadReceipt" && evento?.IsFromMe === true && Array.isArray(evento.MessageIDs)) {
      const estado = String(corpo.state ?? evento.Type ?? "");
      const segundos = typeof evento.Timestamp === "number" ? evento.Timestamp : null;
      await registrarRecibo(
        evento.MessageIDs.filter((id): id is string => typeof id === "string"),
        estado,
        segundos ? new Date(segundos * 1000) : new Date()
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (tipo === "sender") {
    const folderId = typeof corpo.folderID === "string" ? corpo.folderID : null;
    if (folderId && corpo.status === "sending") {
      const supabase = createServiceClient();
      await supabase
        .from("campanha_lotes")
        .update({ status: "enviando", atualizado_em: new Date().toISOString() })
        .eq("folder_id", folderId)
        .in("status", ["criando", "agendado"]);
    }
    if (folderId && corpo.status === "done") {
      // Fecha o lote e agenda o próximo em segundo plano — a resposta à uazapi não espera.
      void processarCampanhas().catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignorado: tipo || "sem EventType" });
}
