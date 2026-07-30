/**
 * Parser do relatório de inventário em PDF (formato "Nome do Produto /
 * Apresentação / Laboratório / Cla / Qtde / Custo / Total Custo / Venda /
 * Total Venda"), gerado por outro sistema de gestão de farmácia.
 *
 * Esse relatório tem um bug de geração: quando o nome do produto ocupa 2
 * linhas, a 2ª linha é desenhada na mesma altura da linha seguinte da
 * tabela, em vez de aumentar a altura da linha — então não dá pra agrupar
 * por coordenada Y. A ordem em que o PDF desenha o texto (stream order),
 * porém, é sempre: [nome do produto, podendo vir em 1 ou 2 linhas] seguido
 * de [as outras colunas daquela linha]. Por isso o parser caminha pelos
 * itens de texto em ordem e alterna entre "fase nome" (x < NAME_COL_END) e
 * "fase dados" (x >= NAME_COL_END) — cada transição dados→nome fecha uma
 * linha e abre a próxima.
 *
 * Cada linha reconstruída é conferida por aritmética (qtde × custo ≈ total
 * custo e qtde × venda ≈ total venda) antes de ser considerada confiável;
 * ~3% das linhas de um arquivo real não bateram (nomes colados/sobrepostos
 * em cascata de 2+ níveis) e foram corretamente rejeitadas por essa
 * checagem — essas ficam de fora da importação automática.
 */

import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseNumeroBR } from "@/lib/estoque-import";
import { garantirPolyfillDOMMatrix } from "@/lib/dommatrix-polyfill";

/**
 * Sem isso, o pdfjs não acha os dados de fontes padrão/cmaps (usados pra
 * decodificar texto de fontes não-embutidas, como a "Courier New" usada
 * nesse relatório) quando o caminho relativo automático dele não bate com
 * onde o Next.js realmente coloca os arquivos em produção — resolve pelo
 * node_modules diretamente em vez de depender desse caminho automático.
 */
function resolverPastasDadosPdfjs(): { standardFontDataUrl: string; cMapUrl: string } | undefined {
  try {
    const require = createRequire(__filename);
    const raizPdfjs = path.dirname(require.resolve("pdfjs-dist/package.json"));
    return {
      standardFontDataUrl: pathToFileURL(path.join(raizPdfjs, "standard_fonts") + path.sep).toString(),
      cMapUrl: pathToFileURL(path.join(raizPdfjs, "cmaps") + path.sep).toString(),
    };
  } catch {
    return undefined;
  }
}

const NAME_COL_END = 180;
const APRES_COL_END = 330;
const LAB_COL_END = 460;
const CLA_COL_END = 515;
const QTDE_COL_END = 608;
const CUSTO_COL_END = 700;
const TOTAL_CUSTO_COL_END = 818;
const VENDA_COL_END = 888;

const TOLERANCIA = 0.02;

export interface EstoquePdfRow {
  pagina: number;
  nome: string;
  laboratorio: string | null;
  estoque: number;
  custo: number;
  venda: number;
}

export interface ParseEstoquePdfResult {
  linhas: EstoquePdfRow[];
  duvidosas: number;
  paginasDuvidosas: number[];
  /** Dados de diagnóstico — ajudam a entender uma importação com 0 resultados. */
  diagnostico: {
    paginas: number;
    itensDeTexto: number;
    amostraTexto: string;
  };
}

interface TextItem {
  x: number;
  text: string;
}

function bucket(items: { x: number; text: string }[], lo: number, hi: number): string {
  return items
    .filter((i) => i.x >= lo && i.x < hi)
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseEstoquePdf(buffer: ArrayBuffer): Promise<ParseEstoquePdfResult> {
  garantirPolyfillDOMMatrix();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await getDocument({ data: new Uint8Array(buffer), ...resolverPastasDadosPdfjs() }).promise;

  const linhas: EstoquePdfRow[] = [];
  const paginasDuvidosasSet = new Set<number>();
  let duvidosas = 0;
  let itensDeTexto = 0;
  const amostraPartes: string[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    let phase: "nome" | "dados" = "nome";
    let nomeParts: string[] = [];
    let outros: TextItem[] = [];

    const flush = () => {
      if (nomeParts.length === 0 && outros.length === 0) return;

      const nome = nomeParts.join(" ").replace(/\s+/g, " ").trim();
      const laboratorio = bucket(outros, APRES_COL_END, LAB_COL_END) || null;
      const qtdeStr = bucket(outros, CLA_COL_END, QTDE_COL_END);
      const custoStr = bucket(outros, QTDE_COL_END, CUSTO_COL_END);
      const totalCustoStr = bucket(outros, CUSTO_COL_END, TOTAL_CUSTO_COL_END);
      const vendaStr = bucket(outros, TOTAL_CUSTO_COL_END, VENDA_COL_END);
      const totalVendaStr = bucket(outros, VENDA_COL_END, Infinity);

      nomeParts = [];
      outros = [];

      if (!nome || !/\d/.test(qtdeStr) || !/\d/.test(custoStr)) return; // cabeçalho/rodapé/página

      const qtde = Math.round(parseNumeroBR(qtdeStr));
      const custo = parseNumeroBR(custoStr);
      const totalCusto = parseNumeroBR(totalCustoStr);
      const venda = parseNumeroBR(vendaStr);
      const totalVenda = parseNumeroBR(totalVendaStr);

      const bateCusto = Math.abs(qtde * custo - totalCusto) < TOLERANCIA;
      const bateVenda = Math.abs(qtde * venda - totalVenda) < TOLERANCIA;

      if (!bateCusto || !bateVenda) {
        duvidosas += 1;
        paginasDuvidosasSet.add(pageNo);
        return;
      }

      linhas.push({ pagina: pageNo, nome, laboratorio, estoque: qtde, custo, venda });
    };

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const x = item.transform[4];
      const text = item.str;

      if (text.trim()) {
        itensDeTexto += 1;
        if (amostraPartes.length < 40) amostraPartes.push(text.trim());
      }

      if (x < NAME_COL_END) {
        if (phase === "dados" && outros.length > 0) {
          flush();
        }
        phase = "nome";
        if (text.trim()) nomeParts.push(text);
      } else {
        phase = "dados";
        if (text.trim()) outros.push({ x, text: text.trim() });
      }
    }
    flush();
  }

  return {
    linhas,
    duvidosas,
    paginasDuvidosas: Array.from(paginasDuvidosasSet).sort((a, b) => a - b),
    diagnostico: { paginas: doc.numPages, itensDeTexto, amostraTexto: amostraPartes.join(" | ") },
  };
}
