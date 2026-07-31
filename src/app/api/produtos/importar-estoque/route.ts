import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
 * Grava em lotes de CHUNK_SIZE (rápido — poucas idas ao banco). Se o lote
 * inteiro falhar (um insert/upsert em massa é uma transação só — 1 linha
 * ruim derruba as ~500 boas do lote junto), tenta de novo linha por linha
 * só pra isolar exatamente qual(is) falharam, sem perder as boas.
 */
async function gravarComIsolamento<T>(
  supabase: SupabaseClient,
  linhas: T[],
  montarLinha: (item: T) => Record<string, unknown>,
  opcoesUpsert?: { onConflict: string }
): Promise<{ ok: number; erros: number; primeiroErro: string | null }> {
  let ok = 0;
  let erros = 0;
  let primeiroErro: string | null = null;

  const gravar = (payload: Record<string, unknown>[]) =>
    opcoesUpsert
      ? supabase.from("produtos").upsert(payload, opcoesUpsert)
      : supabase.from("produtos").insert(payload);

  for (const grupo of chunk(linhas, CHUNK_SIZE)) {
    const { error } = await gravar(grupo.map(montarLinha));
    if (!error) {
      ok += grupo.length;
      continue;
    }
    for (const item of grupo) {
      const { error: erroUnico } = await gravar([montarLinha(item)]);
      if (erroUnico) {
        erros += 1;
        primeiroErro ??= erroUnico.message;
      } else {
        ok += 1;
      }
    }
  }

  return { ok, erros, primeiroErro };
}

/**
 * POST /api/produtos/importar-estoque
 * Importa o relatório de inventário exportado pelo sistema da farmácia, em
 * um de dois formatos. Nenhum dos dois apaga produtos — só cria/atualiza.
 *  - .fp3/.xml: casa pelo código interno (sku). Só tem custo, não tem preço
 *    de venda, então NUNCA toca no preço de produto já existente — produtos
 *    novos entram com preco = custo (precisa de revisão manual).
 *  - .pdf: não tem código de produto, então casa pelo nome (normalizado).
 *    Tem preço de venda real (coluna "Venda"), então esse formato TAMBÉM
 *    atualiza o preço de produtos já existentes (só quando a linha do PDF
 *    tem uma venda válida > 0 — sem isso, o preço que já estava cadastrado
 *    não é tocado).
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

      // O PDF pode ter mais de uma linha com o mesmo nome (produto que
      // aparece 2x no relatório, ou 2 produtos diferentes cujo nome ficou
      // igual por causa de alguma linha mal reconstruída) — sem isso, cada
      // repetição virava um produto novo separado (duplicando o catálogo)
      // ou tentava atualizar o mesmo produto 2x no mesmo lote (o que o
      // Postgres rejeita: "ON CONFLICT DO UPDATE... affect row a second
      // time"). Mantém só a primeira ocorrência de cada nome.
      const nomesVistos = new Set<string>();
      let duplicadasNoArquivo = 0;
      const linhasUnicas = linhas.filter((l) => {
        const chave = normalizarNome(l.nome);
        if (nomesVistos.has(chave)) {
          duplicadasNoArquivo += 1;
          return false;
        }
        nomesVistos.add(chave);
        return true;
      });

      const paraAtualizar = linhasUnicas.filter((l) => nomeParaId.has(normalizarNome(l.nome)));
      const paraCriar = linhasUnicas.filter((l) => !nomeParaId.has(normalizarNome(l.nome)));

      // Diferente do .fp3 (que só tem custo), esse PDF traz o preço de
      // venda de verdade — por isso, ao contrário do .fp3, essa importação
      // TAMBÉM atualiza o preço de produtos já existentes, mas só quando o
      // PDF tem uma venda válida (> 0) pra essa linha; nas raras linhas sem
      // venda no PDF, o preço que já estava cadastrado não é tocado (pra
      // nunca zerar um preço que já existia).
      const paraAtualizarComPreco = paraAtualizar.filter((l) => l.venda > 0);
      const paraAtualizarSemPreco = paraAtualizar.filter((l) => l.venda <= 0);

      const resultadoComPreco = await gravarComIsolamento(
        supabase,
        paraAtualizarComPreco,
        (l) => ({
          id: nomeParaId.get(normalizarNome(l.nome))!,
          laboratorio: l.laboratorio,
          custo: l.custo,
          estoque: l.estoque,
          preco: l.venda,
        }),
        { onConflict: "id" }
      );
      const resultadoSemPreco = await gravarComIsolamento(
        supabase,
        paraAtualizarSemPreco,
        (l) => ({
          id: nomeParaId.get(normalizarNome(l.nome))!,
          laboratorio: l.laboratorio,
          custo: l.custo,
          estoque: l.estoque,
        }),
        { onConflict: "id" }
      );
      const resultadoCriar = await gravarComIsolamento(supabase, paraCriar, (l) => ({
        nome: l.nome,
        laboratorio: l.laboratorio,
        custo: l.custo,
        estoque: l.estoque,
        preco: l.venda > 0 ? l.venda : l.custo,
      }));

      atualizados = resultadoComPreco.ok + resultadoSemPreco.ok;
      criados = resultadoCriar.ok;
      erros = resultadoComPreco.erros + resultadoSemPreco.erros + resultadoCriar.erros;
      primeiroErro = resultadoComPreco.primeiroErro ?? resultadoSemPreco.primeiroErro ?? resultadoCriar.primeiroErro;
      ignoradas += duplicadasNoArquivo;
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

      const resultadoAtualizar = await gravarComIsolamento(
        supabase,
        paraAtualizar,
        (l) => ({ sku: l.sku, nome: l.nome, laboratorio: l.laboratorio, custo: l.custo, estoque: l.estoque }),
        { onConflict: "sku" }
      );
      const resultadoCriar = await gravarComIsolamento(supabase, paraCriar, (l) => ({
        sku: l.sku,
        nome: l.nome,
        laboratorio: l.laboratorio,
        custo: l.custo,
        estoque: l.estoque,
        preco: l.custo,
      }));

      atualizados = resultadoAtualizar.ok;
      criados = resultadoCriar.ok;
      erros = resultadoAtualizar.erros + resultadoCriar.erros;
      primeiroErro = resultadoAtualizar.primeiroErro ?? resultadoCriar.primeiroErro;
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
