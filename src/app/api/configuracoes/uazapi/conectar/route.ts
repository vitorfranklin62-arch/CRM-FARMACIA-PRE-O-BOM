import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";

/**
 * POST /api/configuracoes/uazapi/conectar
 * Pede pra UAIZAP gerar um QR code novo pra conectar o número do WhatsApp
 * da farmácia. Só a dona pode chamar — chave da instância nunca sai do
 * servidor (fica em UAIZAP_API_KEY, variável de ambiente).
 *
 * A resposta é repassada quase crua: o formato exato do campo do QR code
 * pode variar por versão da UAIZAP, então o front tenta reconhecer os
 * formatos mais comuns e, se não reconhecer, mostra a resposta bruta pra
 * dar pra ajustar sem precisar decifrar um erro genérico.
 */
export async function POST() {
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
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/instance/connect`, {
      method: "POST",
      headers: { token: apiKey, Accept: "application/json", "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const dados = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { error: "A UAIZAP recusou o pedido de conexão.", detalhe: dados },
        { status: 502 }
      );
    }

    return NextResponse.json({ dados });
  } catch (erro) {
    const timeout = erro instanceof Error && erro.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timeout
          ? "A UAIZAP não respondeu a tempo (15s). Confira se UAIZAP_BASE_URL está correto e se o servidor está no ar."
          : "Não foi possível falar com a UAIZAP.",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 502 }
    );
  }
}
