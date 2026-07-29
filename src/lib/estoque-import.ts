/**
 * Parser do relatório "Livro Registro de Inventário" exportado pelo sistema
 * da farmácia (formato .fp3 — um XML "prepared report" do FastReport, usado
 * por vários sistemas de gestão de farmácia brasileiros).
 *
 * Cada produto vira um bloco `<b1 t="...">...</b1>` com campos `<dN u="valor"/>`
 * numerados. O mapeamento abaixo foi validado manualmente contra um arquivo
 * real: para várias linhas, custo unitário (d11) × quantidade (d13) bate
 * exatamente com o "Custo Total" (d9) impresso no relatório.
 *
 *   d1  = Nome do Produto
 *   d4  = Laboratório
 *   d11 = Custo unitário
 *   d13 = Quantidade em estoque
 *   d16 = Código interno do produto (mapeado para `sku`)
 */

export interface EstoqueImportRow {
  nome: string;
  laboratorio: string | null;
  custo: number;
  estoque: number;
  sku: string | null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, "&");
}

/** Converte número no formato brasileiro ("1.234,56") para number. */
function parseNumeroBR(text: string): number {
  const cleaned = text.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractField(block: string, tag: string): string {
  // (?!\d) evita que "d1" case dentro de "d10", "d11" etc.
  const re = new RegExp(`<${tag}(?!\\d)(?:\\s+u="([^"]*)")?\\s*/>`);
  const match = block.match(re);
  return match && match[1] !== undefined ? decodeXmlEntities(match[1]) : "";
}

export interface ParseEstoqueResult {
  linhas: EstoqueImportRow[];
  ignoradas: number;
}

export function parseEstoqueFile(content: string): ParseEstoqueResult {
  const linhas: EstoqueImportRow[] = [];
  let ignoradas = 0;

  const blockRe = /<b1\b[^>]*>([\s\S]*?)<\/b1>/g;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(content)) !== null) {
    const block = match[1];

    const nomeRaw = extractField(block, "d1");
    const nome = nomeRaw
      .replace(/\s*sem dados\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!nome) {
      ignoradas += 1;
      continue;
    }

    const laboratorio = extractField(block, "d4").trim() || null;
    const custo = parseNumeroBR(extractField(block, "d11"));
    const estoque = Math.round(parseNumeroBR(extractField(block, "d13")));
    const sku = extractField(block, "d16").trim() || null;

    linhas.push({ nome, laboratorio, custo, estoque, sku });
  }

  return { linhas, ignoradas };
}
