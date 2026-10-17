import { NextResponse } from "next/server";

/**
 * Lê o corpo da requisição como JSON. Se vier inválido, já devolve a resposta
 * 400 pronta pra a rota retornar — cada rota continua validando o conteúdo
 * com o próprio schema e a própria mensagem.
 */
export async function lerCorpoJson(
  request: Request
): Promise<{ corpo: unknown; erro: null } | { corpo: null; erro: NextResponse }> {
  try {
    return { corpo: await request.json(), erro: null };
  } catch {
    return { corpo: null, erro: NextResponse.json({ error: "JSON inválido." }, { status: 400 }) };
  }
}

/** Resposta 500 padrão para exceção não prevista dentro de uma rota. */
export function respostaErroInesperado(err: unknown): NextResponse {
  return NextResponse.json(
    { error: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` },
    { status: 500 }
  );
}
