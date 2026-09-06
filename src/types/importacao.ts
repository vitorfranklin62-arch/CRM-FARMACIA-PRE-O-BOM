/**
 * Tipos compartilhados entre as duas etapas da importação de estoque:
 * a que lê o arquivo (POST /api/produtos/importar-estoque) e a que grava
 * em lotes (POST /api/produtos/importar-estoque/gravar).
 */

/** Uma linha já pronta pra virar registro em `produtos`. */
export interface LinhaImportacao {
  id?: string;
  sku?: string | null;
  nome?: string;
  laboratorio?: string | null;
  custo?: number;
  estoque?: number;
  preco?: number;
  observacoes?: string | null;
}

/** Como cada lote deve ser gravado. */
export type ModoGravacao = "atualizar_por_id" | "atualizar_por_sku" | "criar";

/** Produto que está cadastrado mas não apareceu no arquivo importado. */
export interface ProdutoForaDoArquivo {
  id: string;
  nome: string;
}

/** Resultado da leitura do arquivo: o que será atualizado e o que será criado. */
export interface PlanoImportacao {
  arquivo: string;
  formato: "pdf" | "xlsx" | "fp3";
  /** Qual dos dois relatórios em PDF veio (inventário completo ou lista de medicamentos). */
  formatoPdf?: "inventario" | "lista";
  /** Linhas encontradas no arquivo (antes de descartar duplicadas). */
  total: number;
  /** Linhas descartadas (sem nome, dados que não conferem, ou repetidas). */
  ignoradas: number;
  /** Páginas do PDF que merecem conferência manual. */
  paginasParaRevisar?: number[];
  /** Cadastrados que não estão no arquivo — a remoção depende de confirmação na tela. */
  foraDoArquivo: ProdutoForaDoArquivo[];
  atualizarPorId: LinhaImportacao[];
  atualizarPorSku: LinhaImportacao[];
  criar: LinhaImportacao[];
}

/** Resposta de cada lote gravado. */
export interface ResultadoLote {
  ok: number;
  erros: number;
  primeiroErro: string | null;
}

/** Resposta de cada lote removido. */
export interface ResultadoRemocao {
  removidos: number;
  /** Não puderam ser apagados (produto já usado em algum pedido). */
  bloqueados: number;
  primeiroErro: string | null;
}
