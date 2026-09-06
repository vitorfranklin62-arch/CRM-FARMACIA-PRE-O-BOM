/**
 * Leitura dos relatórios de estoque em PDF. Existem dois formatos, e o
 * `parseEstoquePdf` reconhece qual é pelo cabeçalho da primeira página:
 *
 *  - **inventário** (esse arquivo): "Nome do Produto / Apresentação /
 *    Laboratório / Cla / Qtde / Custo / Total Custo / Venda / Total Venda".
 *  - **lista de medicamentos**: "Nome do Produto | Laboratório | Preço de
 *    Venda | Observações" — lido por `estoque-pdf-lista-import.ts`.
 *
 * Parser do relatório de inventário (formato "Nome do Produto /
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

import { parseNumeroBR } from "@/lib/estoque-import";
import { abrirDocumentoPdf, itensDeTextoDaPagina, type DocumentoPdf } from "@/lib/pdfjs";
import { parseEstoquePdfLista } from "@/lib/estoque-pdf-lista-import";

const NAME_COL_END = 180;
const APRES_COL_END = 330;
const LAB_COL_END = 460;

// Cla/Qtde/Custo/Total Custo/Venda/Total Venda são números alinhados à
// DIREITA numa fonte monoespaçada — a posição inicial (x0) de cada valor
// varia com a quantidade de dígitos (ex.: "6,64" começa bem mais à
// direita que "1.775,08"), então classificar pela borda esquerda é
// frágil e gera erro pra valores mais largos. A borda direita (x1),
// porém, é praticamente fixa por coluna (conferido nas ~2490 linhas de
// um arquivo real: x1 sempre ~483/552/652/760/861/969, sem exceção) —
// os limites abaixo são o ponto médio entre cada par de colunas vizinhas.
const CLA_X1_MAX = 517.5; // Cla (x1≈483) — só usado pra não vazar pro Qtde
const QTDE_X1_MAX = 602; // Qtde (x1≈552) termina antes daqui
const CUSTO_X1_MAX = 706; // Custo (x1≈652)
const TOTAL_CUSTO_X1_MAX = 810.5; // Total Custo (x1≈760)
const VENDA_X1_MAX = 915; // Venda (x1≈861)
// Total Venda (x1≈969): tudo que sobra acima de VENDA_X1_MAX

const TOLERANCIA = 0.02;

export type FormatoPdfEstoque = "inventario" | "lista";

export interface EstoquePdfRow {
  pagina: number;
  nome: string;
  laboratorio: string | null;
  venda: number;
  /** Só no relatório de inventário — a lista de medicamentos não traz quantidade nem custo. */
  estoque?: number;
  custo?: number;
  /** Só na lista de medicamentos. */
  observacoes?: string | null;
}

export interface ParseEstoquePdfResult {
  formato: FormatoPdfEstoque;
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
  x0: number;
  x1: number;
  text: string;
}

/** Classifica pela borda esquerda (x0) — usado pra colunas de texto alinhadas à esquerda. */
function bucketPorX0(items: TextItem[], lo: number, hi: number): string {
  return items
    .filter((i) => i.x0 >= lo && i.x0 < hi)
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classifica pela borda direita (x1) — usado pras colunas numéricas alinhadas à direita. */
function bucketPorX1(items: TextItem[], lo: number, hi: number): string {
  return items
    .filter((i) => i.x1 > lo && i.x1 <= hi)
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function parseInventario(doc: DocumentoPdf, signal?: AbortSignal): Promise<ParseEstoquePdfResult> {
  const linhas: EstoquePdfRow[] = [];
  const paginasDuvidosasSet = new Set<number>();
  let duvidosas = 0;
  let itensDeTexto = 0;
  const amostraPartes: string[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    // Se o navegador desistiu (timeout do lado do cliente, aba fechada), não
    // adianta continuar processando as páginas restantes — sem isso, o
    // parsing (e a gravação que vem depois) seguia rodando no servidor
    // mesmo com ninguém mais esperando a resposta.
    if (signal?.aborted) throw new DOMException("Importação cancelada pelo cliente", "AbortError");

    const itensDaPagina = await itensDeTextoDaPagina(doc, pageNo);

    let phase: "nome" | "dados" = "nome";
    let nomeParts: string[] = [];
    let outros: TextItem[] = [];

    const flush = () => {
      if (nomeParts.length === 0 && outros.length === 0) return;

      const nome = nomeParts.join(" ").replace(/\s+/g, " ").trim();
      const laboratorio = bucketPorX0(outros, APRES_COL_END, LAB_COL_END) || null;
      const qtdeStr = bucketPorX1(outros, CLA_X1_MAX, QTDE_X1_MAX);
      const custoStr = bucketPorX1(outros, QTDE_X1_MAX, CUSTO_X1_MAX);
      const totalCustoStr = bucketPorX1(outros, CUSTO_X1_MAX, TOTAL_CUSTO_X1_MAX);
      const vendaStr = bucketPorX1(outros, TOTAL_CUSTO_X1_MAX, VENDA_X1_MAX);
      const totalVendaStr = bucketPorX1(outros, VENDA_X1_MAX, Infinity);

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

    for (const item of itensDaPagina) {
      const { x0, x1, text } = item;

      if (text.trim()) {
        itensDeTexto += 1;
        if (amostraPartes.length < 40) amostraPartes.push(text.trim());
      }

      if (x0 < NAME_COL_END) {
        if (phase === "dados" && outros.length > 0) {
          flush();
        }
        phase = "nome";
        if (text.trim()) nomeParts.push(text);
      } else {
        phase = "dados";
        if (text.trim()) outros.push({ x0, x1, text: text.trim() });
      }
    }
    flush();
  }

  return {
    formato: "inventario",
    linhas,
    duvidosas,
    paginasDuvidosas: Array.from(paginasDuvidosasSet).sort((a, b) => a - b),
    diagnostico: { paginas: doc.numPages, itensDeTexto, amostraTexto: amostraPartes.join(" | ") },
  };
}

/**
 * Descobre qual dos dois relatórios é o arquivo, olhando o cabeçalho da
 * primeira página. A lista de medicamentos tem as colunas "Preço de Venda"
 * e "Observações"; o inventário tem "Qtde" e "Total Custo".
 */
async function detectarFormato(doc: DocumentoPdf): Promise<FormatoPdfEstoque> {
  const texto = (await itensDeTextoDaPagina(doc, 1))
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ");
  const ehLista = /Pre[çc]o de Venda/i.test(texto) && /Observa[çc][õo]es/i.test(texto);
  return ehLista ? "lista" : "inventario";
}

/** Lê o PDF de estoque, seja ele o inventário completo ou a lista de medicamentos. */
export async function parseEstoquePdf(buffer: ArrayBuffer, signal?: AbortSignal): Promise<ParseEstoquePdfResult> {
  const doc = await abrirDocumentoPdf(buffer);

  if ((await detectarFormato(doc)) === "inventario") return parseInventario(doc, signal);

  const lista = await parseEstoquePdfLista(doc, signal);
  return {
    formato: "lista",
    linhas: lista.linhas,
    duvidosas: lista.duvidosas,
    paginasDuvidosas: lista.paginasDuvidosas,
    diagnostico: { paginas: doc.numPages, itensDeTexto: lista.itensDeTexto, amostraTexto: lista.amostraTexto },
  };
}
