import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { importarEstoqueRemoverSchema } from "@/lib/validation";
import type { ResultadoRemocao } from "@/types/importacao";

/**
 * POST /api/produtos/importar-estoque/remover
 *
 * Apaga um lote de produtos que não apareceram no arquivo de estoque
 * importado. É a única parte da importação que remove alguma coisa, por
 * isso fica numa rota separada e só roda depois de a tela pedir
 * confirmação explícita ("apagar X produtos que não estão no arquivo?").
 *
 * A remoção é feita um a um de propósito: produto já usado em algum pedido
 * tem trava de chave estrangeira no banco (itens_pedido.produto_id) e não
 * pode ser apagado — nesse caso ele é contado como "bloqueado" e continua
 * no catálogo, pra nunca quebrar o histórico de um pedido já feito.
 */
export async function POST(request: Request) {
  try {
    const usuario = await requireDona();

    const body = await request.json().catch(() => null);
    const parsed = importarEstoqueRemoverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Lista de remoção inválida: ${parsed.error.issues[0]?.message ?? "formato inesperado"}` },
        { status: 400 }
      );
    }

    const { ids, arquivo } = parsed.data;
    const supabase = await createClient();

    let removidos = 0;
    let bloqueados = 0;
    let primeiroErro: string | null = null;

    for (const id of ids) {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) {
        bloqueados += 1;
        primeiroErro ??= error.message;
      } else {
        removidos += 1;
      }
    }

    await logAudit(
      supabase,
      "produtos_fora_do_arquivo_removidos",
      "produtos",
      null,
      { arquivo, tentativas: ids.length, removidos, bloqueados },
      usuario.id
    );

    return NextResponse.json({ removidos, bloqueados, primeiroErro } satisfies ResultadoRemocao);
  } catch (err) {
    console.error("[importar-estoque/remover] erro inesperado:", err);
    return NextResponse.json(
      { error: `Erro inesperado ao remover produtos: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
