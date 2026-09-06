/**
 * Parser da "Lista de Medicamentos - Estoque Atualizado" em PDF — o
 * relatório com 4 colunas: Nome do Produto | Laboratório | Preço de Venda |
 * Observações.
 *
 * É um formato diferente do relatório de inventário (esse não traz
 * quantidade nem custo, e traz observações). Por isso a importação desse
 * arquivo NUNCA mexe no estoque de quem já está cadastrado: ela atualiza
 * preço, laboratório e observações, e cadastra o que ainda não existe.
 *
 * Aqui as linhas se comportam bem (cada linha da tabela tem um Y próprio),
 * então dá pra agrupar por coordenada Y — diferente do relatório de
 * inventário, que precisa ser remontado pela ordem do stream. A única
 * sutileza é a coluna Observações, que quebra em várias linhas: as
 * continuações vêm sozinhas, na faixa da direita, e são coladas de volta
 * na observação da linha anterior.
 */
import { parseNumeroBR } from "@/lib/estoque-import";
import { itensDeTextoDaPagina, type DocumentoPdf, type ItemTexto } from "@/lib/pdfjs";

/** Bordas das colunas (x0), medidas em arquivos reais desse relatório. */
const NOME_X_MAX = 260;
const LAB_X_MAX = 405;
const PRECO_X_MAX = 470;
/** Abaixo dessa altura fica o rodapé ("Farmácia Preço Bom - Estoque ..." / "Página N"). */
const RODAPE_Y_MAX = 25;
/** Itens com Y a menos disso um do outro são da mesma linha da tabela. */
const TOLERANCIA_Y = 2;

export interface EstoquePdfListaRow {
  pagina: number;
  nome: string;
  laboratorio: string | null;
  venda: number;
  observacoes: string | null;
}

export interface ParseEstoquePdfListaResult {
  linhas: EstoquePdfListaRow[];
  duvidosas: number;
  paginasDuvidosas: number[];
  itensDeTexto: number;
  amostraTexto: string;
}

function juntar(itens: ItemTexto[]): string {
  return itens
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Agrupa os itens da página em linhas da tabela (mesma altura Y). */
function agruparPorLinha(itens: ItemTexto[]): ItemTexto[][] {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const linhas: ItemTexto[][] = [];

  for (const item of ordenados) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0].y - item.y) <= TOLERANCIA_Y) ultima.push(item);
    else linhas.push([item]);
  }

  return linhas;
}

export async function parseEstoquePdfLista(
  doc: DocumentoPdf,
  signal?: AbortSignal
): Promise<ParseEstoquePdfListaResult> {
  const linhas: EstoquePdfListaRow[] = [];
  const paginasDuvidosasSet = new Set<number>();
  let duvidosas = 0;
  let itensDeTexto = 0;
  const amostraPartes: string[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    // Se o navegador desistiu (timeout do lado do cliente, aba fechada),
    // não adianta continuar processando as páginas restantes.
    if (signal?.aborted) throw new DOMException("Importação cancelada pelo cliente", "AbortError");

    const itens = (await itensDeTextoDaPagina(doc, pageNo)).filter((i) => i.text.trim() && i.y > RODAPE_Y_MAX);
    for (const item of itens) {
      itensDeTexto += 1;
      if (amostraPartes.length < 40) amostraPartes.push(item.text.trim());
    }

    for (const linha of agruparPorLinha(itens)) {
      const nome = juntar(linha.filter((i) => i.x0 < NOME_X_MAX));
      const laboratorio = juntar(linha.filter((i) => i.x0 >= NOME_X_MAX && i.x0 < LAB_X_MAX));
      const precoTexto = juntar(linha.filter((i) => i.x0 >= LAB_X_MAX && i.x0 < PRECO_X_MAX));
      const observacoes = juntar(linha.filter((i) => i.x0 >= PRECO_X_MAX));

      // Cabeçalho da tabela (repetido em toda página) e a linha de subtítulo
      // ("Base: inventário de ... | Nome do Produto • Laboratório • ..."),
      // que cai na coluna do nome mas não é produto nenhum.
      if (nome.includes("Nome do Produto")) continue;

      // Continuação da coluna Observações: vem sozinha, só na faixa da
      // direita — cola de volta na linha anterior em vez de virar produto.
      if (!nome && !laboratorio && !precoTexto && observacoes) {
        const anterior = linhas[linhas.length - 1];
        if (anterior) {
          anterior.observacoes = `${anterior.observacoes ?? ""} ${observacoes}`.replace(/\s+/g, " ").trim();
        }
        continue;
      }

      // Título do relatório e qualquer outra linha solta.
      if (!nome) continue;

      const venda = parseNumeroBR(precoTexto.replace(/R\$/gi, ""));
      if (!(venda > 0)) {
        // Tem nome mas o preço não veio: melhor deixar de fora e avisar
        // qual página conferir do que gravar um produto com preço zerado.
        duvidosas += 1;
        paginasDuvidosasSet.add(pageNo);
        continue;
      }

      linhas.push({ pagina: pageNo, nome, laboratorio: laboratorio || null, venda, observacoes: observacoes || null });
    }
  }

  return {
    linhas,
    duvidosas,
    paginasDuvidosas: Array.from(paginasDuvidosasSet).sort((a, b) => a - b),
    itensDeTexto,
    amostraTexto: amostraPartes.join(" | "),
  };
}
