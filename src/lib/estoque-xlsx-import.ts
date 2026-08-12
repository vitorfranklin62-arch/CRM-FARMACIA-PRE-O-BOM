/**
 * Parser do relatório simplificado de estoque em planilha (.xlsx), com 5
 * colunas fixas: NOME, LABORATÓRIO, VENDA (PREÇO), QUANTIDADE, OBSERVAÇÕES.
 *
 * A coluna OBSERVAÇÕES é o diferencial desse formato: traz substância,
 * referência (nome de marca) e uma lista de "nomes parecidos" pra cada
 * produto (ex.: "Substância: paracetamol | Referência: Tylenol | Nomes
 * parecidos: paracetamol, paracatamol, tylenol, acetaminofeno"). Esse texto
 * é gravado em `produtos.observacoes` e passa a ser buscado também pela
 * função `buscar_produtos` (RPC usada pela IA) — assim, um cliente
 * perguntando por "Tylenol" encontra o produto mesmo ele estando cadastrado
 * só como "Paracetamol 750mg".
 */
import * as XLSX from "xlsx";

export interface EstoqueXlsxRow {
  nome: string;
  laboratorio: string | null;
  venda: number;
  estoque: number;
  observacoes: string | null;
}

export interface ParseEstoqueXlsxResult {
  linhas: EstoqueXlsxRow[];
  ignoradas: number;
}

function textoDaCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function numeroDaCelula(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function parseEstoqueXlsx(buffer: ArrayBuffer): ParseEstoqueXlsxResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  const linhasBrutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, { defval: "" });

  const linhas: EstoqueXlsxRow[] = [];
  let ignoradas = 0;

  for (const linha of linhasBrutas) {
    const nome = textoDaCelula(linha["NOME"]);
    if (!nome) {
      ignoradas += 1;
      continue;
    }

    linhas.push({
      nome,
      laboratorio: textoDaCelula(linha["LABORATÓRIO"]) || null,
      venda: numeroDaCelula(linha["VENDA (PREÇO)"]),
      estoque: Math.round(numeroDaCelula(linha["QUANTIDADE"])),
      observacoes: textoDaCelula(linha["OBSERVAÇÕES"]) || null,
    });
  }

  return { linhas, ignoradas };
}
