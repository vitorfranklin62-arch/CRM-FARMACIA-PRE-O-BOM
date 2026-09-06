import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseEstoqueFile, normalizarNome } from "@/lib/estoque-import";
import { parseEstoquePdf } from "@/lib/estoque-pdf-import";
import { parseEstoqueXlsx } from "@/lib/estoque-xlsx-import";
import { selecionarTodos } from "@/lib/supabase/fetch-all";
import type { LinhaImportacao, PlanoImportacao } from "@/types/importacao";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * POST /api/produtos/importar-estoque
 *
 * Etapa 1 de 2 da importação: **só lê e confere o arquivo**, sem gravar
 * nada. Devolve o "plano" — a lista pronta do que atualizar e do que criar.
 * Quem grava é /api/produtos/importar-estoque/gravar, em lotes.
 *
 * Por que dividido em duas etapas: com catálogo grande (milhares de
 * produtos), ler o arquivo E gravar tudo numa requisição só passava de 2
 * minutos, e a importação era cancelada no meio pelo navegador (ou pelo
 * proxy do servidor) — sem ninguém saber o que tinha entrado e o que não.
 * Em lotes, cada requisição é curta, nada estoura o tempo limite e a tela
 * consegue mostrar a barra de progresso subindo de verdade.
 *
 * Formatos aceitos (nenhum apaga produtos — só cria/atualiza):
 *  - .fp3/.xml: casa pelo código interno (sku). Só tem custo, não tem preço
 *    de venda, então NUNCA toca no preço de produto já existente — produtos
 *    novos entram com preco = custo (precisa de revisão manual).
 *  - .pdf: não tem código de produto, então casa pelo nome (normalizado).
 *    Tem preço de venda real (coluna "Venda"), então esse formato TAMBÉM
 *    atualiza o preço de produtos já existentes (só quando a linha do PDF
 *    tem uma venda válida > 0 — sem isso, o preço que já estava cadastrado
 *    não é tocado).
 *  - .xlsx: planilha simplificada (NOME, LABORATÓRIO, VENDA (PREÇO),
 *    QUANTIDADE, OBSERVAÇÕES). Casa pelo nome, igual o .pdf, e também
 *    sempre atualiza o preço (a coluna VENDA vem sempre preenchida nesse
 *    formato). A grande diferença é a coluna OBSERVAÇÕES, gravada em
 *    `produtos.observacoes` — substância, referência e "nomes parecidos"
 *    que a função buscar_produtos() (usada pela IA) passa a buscar também,
 *    reduzindo falso "não temos esse produto" quando o cliente pergunta
 *    por um nome comercial diferente do cadastrado.
 */
export async function POST(request: Request) {
  const inicio = Date.now();
  // Logs simples (visíveis nos logs do EasyPanel) — sem eles, uma
  // importação lenta é uma caixa preta: não dá pra saber se o gargalo é
  // ler o PDF ou buscar o catálogo atual.
  const log = (etapa: string) => console.log(`[importar-estoque] ${etapa} (+${Date.now() - inicio}ms)`);

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
    const ehXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    log(`recebeu arquivo "${file.name}" (${(file.size / 1024).toFixed(0)}KB)`);

    const supabase = await createClient();
    // Sem paginar, o Supabase só devolve as primeiras 1000 linhas (limite
    // padrão do PostgREST, silencioso — sem erro) — com catálogo grande,
    // isso fazia a importação "esquecer" produtos além da linha 1000 e
    // tratá-los como novos, duplicando o catálogo a cada importação.
    const { data: existentes, error: fetchError } = await selecionarTodos<{
      id: string;
      sku: string | null;
      nome: string;
    }>((from, to) => supabase.from("produtos").select("id, sku, nome").range(from, to));
    if (fetchError) {
      return NextResponse.json({ error: `Não foi possível ler o catálogo atual: ${fetchError.message}` }, { status: 500 });
    }
    log(`buscou catálogo atual (${existentes.length} produtos)`);

    const atualizarPorId: LinhaImportacao[] = [];
    const atualizarPorSku: LinhaImportacao[] = [];
    const criar: LinhaImportacao[] = [];
    let total = 0;
    let ignoradas = 0;
    let paginasParaRevisar: number[] = [];

    if (ehPdf) {
      const buffer = await file.arrayBuffer();
      const { linhas, duvidosas, paginasDuvidosas, diagnostico } = await parseEstoquePdf(buffer, request.signal);
      log(`terminou de ler o PDF (${linhas.length} linhas válidas, ${duvidosas} duvidosas)`);

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

      const nomeParaId = new Map(existentes.map((p) => [normalizarNome(p.nome), p.id]));

      // O PDF pode ter mais de uma linha com o mesmo nome (produto que
      // aparece 2x no relatório, ou 2 produtos diferentes cujo nome ficou
      // igual por causa de alguma linha mal reconstruída) — sem isso, cada
      // repetição virava um produto novo separado (duplicando o catálogo)
      // ou tentava atualizar o mesmo produto 2x no mesmo lote (o que o
      // Postgres rejeita: "ON CONFLICT DO UPDATE... affect row a second
      // time"). Mantém só a primeira ocorrência de cada nome.
      const nomesVistos = new Set<string>();
      let duplicadasNoArquivo = 0;

      for (const l of linhas) {
        const chave = normalizarNome(l.nome);
        if (nomesVistos.has(chave)) {
          duplicadasNoArquivo += 1;
          continue;
        }
        nomesVistos.add(chave);

        const id = nomeParaId.get(chave);
        if (id) {
          // Diferente do .fp3 (que só tem custo), esse PDF traz o preço de
          // venda de verdade — por isso essa importação TAMBÉM atualiza o
          // preço de produtos já existentes, mas só quando o PDF tem uma
          // venda válida (> 0) pra essa linha; nas raras linhas sem venda,
          // o preço já cadastrado não é tocado (pra nunca zerar um preço).
          atualizarPorId.push({
            id,
            laboratorio: l.laboratorio,
            custo: l.custo,
            estoque: l.estoque,
            ...(l.venda > 0 ? { preco: l.venda } : {}),
          });
        } else {
          criar.push({
            nome: l.nome,
            laboratorio: l.laboratorio,
            custo: l.custo,
            estoque: l.estoque,
            preco: l.venda > 0 ? l.venda : l.custo,
          });
        }
      }

      ignoradas += duplicadasNoArquivo;
    } else if (ehXlsx) {
      const buffer = await file.arrayBuffer();
      const { linhas, ignoradas: ignoradasSemNome } = parseEstoqueXlsx(buffer);
      log(`terminou de ler a planilha (${linhas.length} linhas)`);

      if (linhas.length === 0) {
        return NextResponse.json(
          {
            error:
              "Não encontrei nenhum produto nessa planilha. Confirma se as colunas são NOME, LABORATÓRIO, VENDA (PREÇO), QUANTIDADE e OBSERVAÇÕES?",
          },
          { status: 400 }
        );
      }

      total = linhas.length;
      ignoradas = ignoradasSemNome;

      const nomeParaId = new Map(existentes.map((p) => [normalizarNome(p.nome), p.id]));

      // Mesmo motivo do .pdf: uma planilha pode ter o mesmo nome repetido —
      // mantém só a primeira ocorrência pra não duplicar nem quebrar o
      // upsert em lote (Postgres rejeita 2 updates pro mesmo id no mesmo lote).
      const nomesVistos = new Set<string>();
      let duplicadasNoArquivo = 0;

      for (const l of linhas) {
        const chave = normalizarNome(l.nome);
        if (nomesVistos.has(chave)) {
          duplicadasNoArquivo += 1;
          continue;
        }
        nomesVistos.add(chave);

        const id = nomeParaId.get(chave);
        if (id) {
          atualizarPorId.push({
            id,
            laboratorio: l.laboratorio,
            estoque: l.estoque,
            observacoes: l.observacoes,
            ...(l.venda > 0 ? { preco: l.venda } : {}),
          });
        } else {
          criar.push({
            nome: l.nome,
            laboratorio: l.laboratorio,
            estoque: l.estoque,
            observacoes: l.observacoes,
            preco: l.venda,
          });
        }
      }

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

      const skusExistentes = new Set(existentes.filter((p) => p.sku).map((p) => p.sku as string));

      for (const l of linhas) {
        if (l.sku && skusExistentes.has(l.sku)) {
          atualizarPorSku.push({
            sku: l.sku,
            nome: l.nome,
            laboratorio: l.laboratorio,
            custo: l.custo,
            estoque: l.estoque,
          });
        } else {
          criar.push({
            sku: l.sku,
            nome: l.nome,
            laboratorio: l.laboratorio,
            custo: l.custo,
            estoque: l.estoque,
            preco: l.custo,
          });
        }
      }
    }

    const plano: PlanoImportacao = {
      arquivo: file.name,
      formato: ehPdf ? "pdf" : ehXlsx ? "xlsx" : "fp3",
      total,
      ignoradas,
      paginasParaRevisar: paginasParaRevisar.length > 0 ? paginasParaRevisar : undefined,
      atualizarPorId,
      atualizarPorSku,
      criar,
    };

    log(
      `plano pronto (${atualizarPorId.length + atualizarPorSku.length} pra atualizar, ${criar.length} pra criar), respondendo`
    );
    return NextResponse.json(plano);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      log("interrompido: cliente cancelou/desconectou");
      return NextResponse.json({ error: "Importação cancelada." }, { status: 499 });
    }
    console.error("[importar-estoque] erro inesperado:", err);
    return NextResponse.json(
      { error: `Erro inesperado ao importar: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
