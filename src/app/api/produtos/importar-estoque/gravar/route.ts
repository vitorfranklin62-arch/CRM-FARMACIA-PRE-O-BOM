import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { importacaoLinhaSchema, importarEstoqueLoteSchema } from "@/lib/validation";
import type { ModoGravacao, ResultadoLote } from "@/types/importacao";

/** Quantas linhas vão de uma vez pro banco dentro do lote recebido. */
const TAMANHO_GRUPO = 250;

function agrupar<T>(items: T[], size: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += size) grupos.push(items.slice(i, i + size));
  return grupos;
}

/**
 * Grava em grupos de TAMANHO_GRUPO (rápido — poucas idas ao banco). Se o
 * grupo inteiro falhar (um insert/upsert em massa é uma transação só — 1
 * linha ruim derruba as boas junto), tenta de novo linha por linha só pra
 * isolar exatamente qual(is) falharam, sem perder as boas.
 */
async function gravarComIsolamento(
  supabase: SupabaseClient,
  linhas: Record<string, unknown>[],
  opcoesUpsert?: { onConflict: string }
): Promise<ResultadoLote> {
  let ok = 0;
  let erros = 0;
  let primeiroErro: string | null = null;

  const gravar = (payload: Record<string, unknown>[]) =>
    opcoesUpsert ? supabase.from("produtos").upsert(payload, opcoesUpsert) : supabase.from("produtos").insert(payload);

  for (const grupo of agrupar(linhas, TAMANHO_GRUPO)) {
    const { error } = await gravar(grupo);
    if (!error) {
      ok += grupo.length;
      continue;
    }
    for (const linha of grupo) {
      const { error: erroUnico } = await gravar([linha]);
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

/** Confere se a linha tem a chave que o modo de gravação exige. */
function chaveOk(modo: ModoGravacao, linha: Record<string, unknown>): boolean {
  if (modo === "atualizar_por_id") return Boolean(linha.id);
  if (modo === "atualizar_por_sku") return Boolean(linha.sku);
  return Boolean(linha.nome);
}

/**
 * POST /api/produtos/importar-estoque/gravar
 *
 * Etapa 2 de 2 da importação: grava UM lote do plano montado pela etapa 1
 * (POST /api/produtos/importar-estoque). A tela manda um lote por vez e vai
 * enchendo a barra de progresso conforme cada um responde — assim nenhuma
 * requisição fica minutos aberta e nada é cancelado no meio do caminho.
 *
 * O último lote manda também o `resumo`, que fecha a importação registrando
 * na auditoria o que entrou.
 */
export async function POST(request: Request) {
  try {
    await requireDona();

    const body = await request.json().catch(() => null);
    const parsed = importarEstoqueLoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: `Lote inválido: ${parsed.error.issues[0]?.message ?? "formato inesperado"}` }, { status: 400 });
    }

    const { modo, linhas, resumo } = parsed.data;

    // Valida linha por linha: o schema também serve de filtro de colunas
    // (o zod descarta qualquer campo que não seja coluna de `produtos` que
    // a importação pode tocar). Uma linha ruim vira erro só dela — as
    // outras ~250 do lote seguem normalmente.
    const payload: Record<string, unknown>[] = [];
    let errosDeValidacao = 0;
    let primeiroErroValidacao: string | null = null;

    for (const linha of linhas) {
      const linhaParsed = importacaoLinhaSchema.safeParse(linha);
      if (!linhaParsed.success || !chaveOk(modo, linhaParsed.data)) {
        errosDeValidacao += 1;
        primeiroErroValidacao ??= linhaParsed.success
          ? "Linha sem a chave necessária (id, sku ou nome)."
          : `Linha com dado inválido: ${linhaParsed.error.issues[0]?.message ?? "formato inesperado"}`;
        continue;
      }
      payload.push(linhaParsed.data as Record<string, unknown>);
    }

    const supabase = await createClient();

    let resultado: ResultadoLote = { ok: 0, erros: 0, primeiroErro: null };
    if (payload.length > 0) {
      const opcoes =
        modo === "atualizar_por_id"
          ? { onConflict: "id" }
          : modo === "atualizar_por_sku"
            ? { onConflict: "sku" }
            : undefined;
      resultado = await gravarComIsolamento(supabase, payload, opcoes);
    }

    if (resumo) {
      await logAudit(supabase, "estoque_importado", "produtos", null, resumo);
    }

    return NextResponse.json({
      ok: resultado.ok,
      erros: resultado.erros + errosDeValidacao,
      primeiroErro: resultado.primeiroErro ?? primeiroErroValidacao,
    } satisfies ResultadoLote);
  } catch (err) {
    console.error("[importar-estoque/gravar] erro inesperado:", err);
    return NextResponse.json(
      { error: `Erro inesperado ao gravar o lote: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
