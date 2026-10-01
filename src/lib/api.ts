import { NextResponse } from "next/server";
import type { z } from "zod";

type CorpoLido<S extends z.ZodType> =
  | { dados: z.output<S>; resposta?: never }
  | { dados?: never; resposta: NextResponse };

/**
 * Lê o corpo JSON da requisição e valida com o schema. Em caso de falha
 * devolve `resposta` (400) pronta pra ser retornada pela rota; senão `dados`.
 *
 *   const corpo = await lerCorpo(request, meuSchema);
 *   if (corpo.resposta) return corpo.resposta;
 *   const { campo } = corpo.dados;
 */
export async function lerCorpo<S extends z.ZodType>(
  request: Request,
  schema: S,
  { erro = "Payload inválido.", comDetalhes = false }: { erro?: string; comDetalhes?: boolean } = {}
): Promise<CorpoLido<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { resposta: NextResponse.json({ error: "JSON inválido." }, { status: 400 }) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const resposta = NextResponse.json(
      comDetalhes ? { error: erro, detalhes: parsed.error.flatten() } : { error: erro },
      { status: 400 }
    );
    return { resposta };
  }

  return { dados: parsed.data };
}

/** Resposta 500 padrão pra erro não previsto dentro de uma rota. */
export function erroInesperado(err: unknown): NextResponse {
  return NextResponse.json(
    { error: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` },
    { status: 500 }
  );
}

/** true se `id` tem cara de UUID (evita mandar lixo pro banco em parâmetros de rota). */
export function ehUuid(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}
