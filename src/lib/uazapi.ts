import { NextResponse } from "next/server";

/**
 * Chama a instância de WhatsApp na UAIZAP e repassa a resposta (quase crua)
 * pro painel — o formato exato varia por versão da UAIZAP, então o front
 * reconhece o que conseguir e, no resto, mostra a resposta bruta pra dar pra
 * ajustar sem decifrar um erro genérico. A chave da instância nunca sai do
 * servidor (fica em UAIZAP_API_KEY). Quem chama deve garantir antes que o
 * usuário é a dona.
 */
export async function chamarUazapi({
  caminho,
  metodo,
  mensagemRecusa,
}: {
  caminho: string;
  metodo: "GET" | "POST";
  /** Texto do erro quando a UAIZAP responde com status de falha. */
  mensagemRecusa: string;
}): Promise<NextResponse> {
  const baseUrl = process.env.UAIZAP_BASE_URL;
  const apiKey = process.env.UAIZAP_API_KEY;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "UAIZAP_BASE_URL e UAIZAP_API_KEY precisam estar configurados no servidor." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${caminho}`, {
      method: metodo,
      headers: {
        token: apiKey,
        Accept: "application/json",
        ...(metodo === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      // Sem timeout, uma UAIZAP fora do ar deixava a requisição pendurada até
      // o proxy na frente do servidor cortar a conexão — aí o navegador
      // recebia uma página de erro genérica em vez da nossa resposta JSON.
      signal: AbortSignal.timeout(15_000),
    });

    const dados = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json({ error: mensagemRecusa, detalhe: dados }, { status: 502 });
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
