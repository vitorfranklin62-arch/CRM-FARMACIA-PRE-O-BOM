import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { normalizarNome } from "@/lib/estoque-import";

interface ProdutoLinha {
  id: string;
  nome: string;
  custo: number | null;
  preco: number;
  estoque: number;
  atualizado_em: string;
}

/**
 * Agrupa produtos pelo nome normalizado. Dentro de cada grupo com mais de
 * 1 linha, a mais recentemente atualizada é a "sobrevivente" (mantida) —
 * as outras são candidatas a remoção. Isso existe porque a importação de
 * estoque em PDF casa produtos por nome (não tem código/SKU nesse
 * formato) e, antes de algumas correções, linhas que deveriam ter
 * atualizado um produto existente às vezes viravam produtos novos
 * duplicados.
 */
function agruparDuplicados(produtos: ProdutoLinha[]) {
  const grupos = new Map<string, ProdutoLinha[]>();
  for (const p of produtos) {
    const chave = normalizarNome(p.nome);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(p);
    else grupos.set(chave, [p]);
  }

  const duplicados = Array.from(grupos.values()).filter((g) => g.length > 1);
  for (const g of duplicados) {
    g.sort((a, b) => new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime());
  }
  return duplicados;
}

/** GET: só mostra o que seria removido, não mexe em nada. */
export async function GET() {
  try {
    await requireDona();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, custo, preco, estoque, atualizado_em");
    if (error) {
      return NextResponse.json({ error: `Não foi possível ler o catálogo: ${error.message}` }, { status: 500 });
    }

    const duplicados = agruparDuplicados(data ?? []);
    const linhasParaRemover = duplicados.reduce((acc, g) => acc + g.length - 1, 0);

    return NextResponse.json({
      totalProdutos: data?.length ?? 0,
      gruposDuplicados: duplicados.length,
      linhasParaRemover,
      amostra: duplicados.slice(0, 15).map((g) => ({
        nome: g[0].nome,
        mantido: { id: g[0].id, custo: g[0].custo, preco: g[0].preco, estoque: g[0].estoque },
        removidos: g.slice(1).map((p) => ({ id: p.id, custo: p.custo, preco: p.preco, estoque: p.estoque })),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * POST: executa a remoção de verdade. Mantém sempre a linha mais
 * recentemente atualizada de cada nome duplicado. Produtos já
 * referenciados em algum pedido (pedido_itens) não podem ser apagados
 * (o banco tem uma trava de chave estrangeira pra isso) — nesse caso a
 * linha antiga fica de fora da remoção e é reportada separadamente, pra
 * nunca quebrar o histórico de um pedido já feito.
 */
export async function POST() {
  try {
    const usuario = await requireDona();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, custo, preco, estoque, atualizado_em");
    if (error) {
      return NextResponse.json({ error: `Não foi possível ler o catálogo: ${error.message}` }, { status: 500 });
    }

    const duplicados = agruparDuplicados(data ?? []);
    const idsParaRemover = duplicados.flatMap((g) => g.slice(1).map((p) => p.id));

    let removidos = 0;
    let bloqueados = 0;
    let primeiroErro: string | null = null;

    for (const id of idsParaRemover) {
      const { error: erroExclusao } = await supabase.from("produtos").delete().eq("id", id);
      if (erroExclusao) {
        bloqueados += 1;
        primeiroErro ??= erroExclusao.message;
      } else {
        removidos += 1;
      }
    }

    await logAudit(
      supabase,
      "produtos_duplicados_removidos",
      "produtos",
      null,
      { gruposDuplicados: duplicados.length, tentativas: idsParaRemover.length, removidos, bloqueados },
      usuario.id
    );

    return NextResponse.json({
      gruposDuplicados: duplicados.length,
      removidos,
      bloqueados,
      primeiroErro,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
