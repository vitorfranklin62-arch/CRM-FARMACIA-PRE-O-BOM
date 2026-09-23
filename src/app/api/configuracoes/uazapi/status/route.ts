import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";

/**
 * GET /api/configuracoes/uazapi/status
 * Consulta o status da instância de WhatsApp (conectada/desconectada) na
 * UAIZAP. Só a dona pode chamar — chave da instância nunca sai do servidor.
 */
export async function GET() {
  await requireDona();

  const baseUrl = process.env.UAIZAP_BASE_URL;
  const apiKey = process.env.UAIZAP_API_KEY;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "UAIZAP_BASE_URL e UAIZAP_API_KEY precisam estar configurados no servidor." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/instance/status`, {
      headers: { token: apiKey, Accept: "application/json" },
      cache: "no-store",
    });

    const dados = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { error: "A UAIZAP recusou a consulta de status.", detalhe: dados },
        { status: 502 }
      );
    }

    return NextResponse.json({ dados });
  } catch (erro) {
    return NextResponse.json(
      { error: "Não foi possível falar com a UAIZAP.", detalhe: erro instanceof Error ? erro.message : String(erro) },
      { status: 502 }
    );
  }
}
