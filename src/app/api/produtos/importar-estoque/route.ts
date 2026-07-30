import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { parseEstoqueFile, normalizarNome } from "@/lib/estoque-import";
import { parseEstoquePdf } from "@/lib/estoque-pdf-import";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * POST /api/produtos/importar-estoque
 * Importa o relatório de inventário exportado pelo sistema da farmácia, em
 * um de dois formatos:
 *  - .fp3/.xml: casa pelo código interno (sku). Produtos novos entram com
 *    preco = custo (esse formato não tem preço de venda, precisa revisão).
 *  - .pdf: esse formato não tem código de produto, então casa pelo nome
 *    (normalizado). Tem preço de venda real (coluna "Venda"), então
 *    produtos novos já entram com o preço correto.
 * Em ambos os casos: nunca apaga produtos e nunca sobrescreve o preço de
 * venda de produtos já cadastrados — só atualiza laboratório/custo/estoque.
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

    const ehPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

    const supabase = await createClient();
    const { data: existentes, error: fetchError } = await supabase.from("produtos").select("id, sku, nome");
    if (fetchError) {
      return NextResponse.json({ error: `Não foi possível ler o catálogo atual: ${fetchError.message}` }, { status: 500 });
    }

    let atualizados = 0;
    let criados = 0;
    let erros = 0;
    let primeiroErro: string | null = null;
    let total = 0;
    let ignoradas = 0;
    let paginasParaRevisar: number[] = [];

    if (ehPdf) {
      const buffer = await file.arrayBuffer();
      const { linhas, duvidosas, paginasDuvidosas, diagnostico } = await parseEstoquePdf(buffer);

      if (linhas.length === 0) {
        const detalhe = `[diagnóstico: ${diagnostico.paginas} página(s), ${diagnostico.itensDeTexto} item(ns) de texto, ${duvidosas} linha(s) reconhecida(s) mas reprovada(s) na conferência. Amostra: ${diagnostico.amostraTexto || "(vazio)"}]`;
        return NextResponse.json(
          { error: `Não encontrei nenhum produto nesse PDF. Confirma se é o arquivo certo? ${detalhe}` },
          { status: 400 }
        );
      }

      total = linhas.length;
      ignoradas = duvidosas;
      paginasParaRevisar = paginasDuvidosas;

      const nomeParaId = new Map((existentes ?? []).map((p) => [normalizarNome(p.nome), p.id]));

      const paraAtualizar = linhas.filter((l) => nomeParaId.has(normalizarNome(l.nome)));
      const paraCriar = linhas.filter((l) => !nomeParaId.has(normalizarNome(l.nome)));

      for (const grupo of chunk(paraAtualizar, CHUNK_SIZE)) {
        for (const l of grupo) {
          const id = nomeParaId.get(normalizarNome(l.nome))!;
          const { error } = await supabase
            .from("produtos")
            .update({ laboratorio: l.laboratorio, custo: l.custo, estoque: l.estoque })
            .eq("id", id);
          if (error) {
            erros += 1;
            primeiroErro ??= error.message;
          } else {
            atualizados += 1;
          }
        }
      }

      for (const grupo of chunk(paraCriar, CHUNK_SIZE)) {
        const { error } = await supabase.from("produtos").insert(
          grupo.map((l) => ({
            nome: l.nome,
            laboratorio: l.laboratorio,
            custo: l.custo,
            estoque: l.estoque,
            preco: l.venda > 0 ? l.venda : l.custo,
          }))
        );
        if (error) {
          erros += grupo.length;
          primeiroErro ??= error.message;
        } else {
          criados += grupo.length;
        }
      }
    } else {
      const content = await file.text();
      const { linhas, ignoradas: ignoradasSemNome } = parseEstoqueFile(content);

      if (linhas.length === 0) {
        return NextResponse.json(
          { error: "Não encontrei nenhum produto nesse arquivo. Confirma se é o arquivo certo?" },
          { status: 400 }
        );
      }

      total = linhas.length;
      ignoradas = ignoradasSemNome;

      const skuParaId = new Map((existentes ?? []).filter((p) => p.sku).map((p) => [p.sku as string, p.id]));

      const paraAtualizar = linhas.filter((l) => l.sku && skuParaId.has(l.sku));
      const paraCriar = linhas.filter((l) => !l.sku || !skuParaId.has(l.sku));

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
    }

    await logAudit(supabase, "estoque_importado", "produtos", null, {
      arquivo: file.name,
      formato: ehPdf ? "pdf" : "fp3",
      total,
      atualizados,
      criados,
      erros,
      ignoradas,
    });

    return NextResponse.json({
      total,
      atualizados,
      criados,
      erros,
      ignoradas,
      primeiroErro,
      paginasParaRevisar: paginasParaRevisar.length > 0 ? paginasParaRevisar : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro inesperado ao importar: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
