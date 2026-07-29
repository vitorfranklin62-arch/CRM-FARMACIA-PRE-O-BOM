import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { parseEstoqueFile } from "@/lib/estoque-import";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * POST /api/produtos/importar-estoque
 * Importa o relatório de inventário exportado pelo sistema da farmácia
 * (formato .fp3). Nunca apaga produtos e nunca sobrescreve o preço de venda
 * de produtos já cadastrados — só atualiza nome/laboratório/custo/estoque
 * pelo código interno (sku). Produtos novos entram com preco = custo (valor
 * inicial, precisa de revisão manual).
 */
export async function POST(request: Request) {
  try {
    await requireDona();

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    // Evita `instanceof File`: o construtor global File só existe em
    // versões mais novas do Node, e pode não estar disponível dependendo
    // do runtime — checar por string (formulário sem arquivo) é suficiente.
    if (!fileEntry || typeof fileEntry === "string") {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const file = fileEntry as File;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande (máximo 15MB)." }, { status: 400 });
    }

    const content = await file.text();
    const { linhas, ignoradas } = parseEstoqueFile(content);

    if (linhas.length === 0) {
      return NextResponse.json(
        { error: "Não encontrei nenhum produto nesse arquivo. Confirma se é o arquivo certo?" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: existentes, error: fetchError } = await supabase.from("produtos").select("id, sku");
    if (fetchError) {
      return NextResponse.json({ error: `Não foi possível ler o catálogo atual: ${fetchError.message}` }, { status: 500 });
    }

    const skuParaId = new Map((existentes ?? []).filter((p) => p.sku).map((p) => [p.sku as string, p.id]));

    const paraAtualizar = linhas.filter((l) => l.sku && skuParaId.has(l.sku));
    const paraCriar = linhas.filter((l) => !l.sku || !skuParaId.has(l.sku));

    let atualizados = 0;
    let criados = 0;
    let erros = 0;
    let primeiroErro: string | null = null;

    for (const grupo of chunk(paraAtualizar, CHUNK_SIZE)) {
      const { error } = await supabase.from("produtos").upsert(
        grupo.map((l) => ({
          sku: l.sku,
          nome: l.nome,
          laboratorio: l.laboratorio,
          custo: l.custo,
          estoque: l.estoque,
        })),
        { onConflict: "sku" }
      );
      if (error) {
        erros += grupo.length;
        primeiroErro ??= error.message;
      } else {
        atualizados += grupo.length;
      }
    }

    for (const grupo of chunk(paraCriar, CHUNK_SIZE)) {
      const { error } = await supabase.from("produtos").insert(
        grupo.map((l) => ({
          sku: l.sku,
          nome: l.nome,
          laboratorio: l.laboratorio,
          custo: l.custo,
          estoque: l.estoque,
          preco: l.custo,
        }))
      );
      if (error) {
        erros += grupo.length;
        primeiroErro ??= error.message;
      } else {
        criados += grupo.length;
      }
    }

    await logAudit(supabase, "estoque_importado", "produtos", null, {
      arquivo: file.name,
      total: linhas.length,
      atualizados,
      criados,
      erros,
      ignoradas,
    });

    return NextResponse.json({ total: linhas.length, atualizados, criados, erros, ignoradas, primeiroErro });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro inesperado ao importar: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
