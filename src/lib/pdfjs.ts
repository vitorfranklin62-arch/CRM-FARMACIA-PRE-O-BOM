/**
 * Abertura de PDF com o pdfjs, compartilhada pelos parsers de estoque.
 *
 * O pdfjs resolve seus próprios arquivos auxiliares (dados de fontes/cmaps
 * e o "worker" que faz o parsing) por caminho relativo ao módulo em que
 * está rodando. Isso quebra assim que o Next.js empacota a rota (o arquivo
 * físico não fica mais do lado do módulo bundlado) — daí os erros
 * "standardFontDataUrl not provided" e depois "Cannot find module
 * '.../pdf.worker.mjs'". `__filename`/`createRequire` também não servem
 * aqui: dentro do bundle do webpack, `__filename` vira um ID de módulo (não
 * um caminho) e `createRequire` some silenciosamente. A única coisa
 * confiável em produção é `process.cwd()` (raiz do projeto, onde o
 * `next start` roda) — monta o caminho até o pacote via node_modules
 * direto, sem depender de nenhuma resolução dinâmica de módulo.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { garantirPolyfillDOMMatrix } from "@/lib/dommatrix-polyfill";

function resolverCaminhosPdfjs() {
  const raizPdfjs = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  return {
    standardFontDataUrl: pathToFileURL(path.join(raizPdfjs, "standard_fonts") + path.sep).toString(),
    cMapUrl: pathToFileURL(path.join(raizPdfjs, "cmaps") + path.sep).toString(),
    workerSrc: pathToFileURL(path.join(raizPdfjs, "legacy", "build", "pdf.worker.mjs")).toString(),
  };
}

export async function abrirDocumentoPdf(buffer: ArrayBuffer) {
  garantirPolyfillDOMMatrix();
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const { standardFontDataUrl, cMapUrl, workerSrc } = resolverCaminhosPdfjs();
  GlobalWorkerOptions.workerSrc = workerSrc;

  return getDocument({ data: new Uint8Array(buffer), standardFontDataUrl, cMapUrl }).promise;
}

/** Documento já aberto pelo pdfjs (tipo derivado pra não importar tipos do pacote). */
export type DocumentoPdf = Awaited<ReturnType<typeof abrirDocumentoPdf>>;

/** Item de texto do PDF com as bordas esquerda (x0) e direita (x1) já calculadas. */
export interface ItemTexto {
  x0: number;
  x1: number;
  y: number;
  text: string;
}

/** Lê os itens de texto de uma página, já com as coordenadas normalizadas. */
export async function itensDeTextoDaPagina(doc: DocumentoPdf, pageNo: number): Promise<ItemTexto[]> {
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  const itens: ItemTexto[] = [];

  for (const item of content.items) {
    if (!("str" in item)) continue;
    const x0 = item.transform[4];
    itens.push({ x0, x1: x0 + item.width, y: item.transform[5], text: item.str });
  }

  return itens;
}
