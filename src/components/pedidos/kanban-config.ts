import type { PedidoStatus } from "@/types/database";

/**
 * Identidade visual de cada etapa do quadro. Ficam todas juntas aqui pra
 * coluna, cartão e "fantasma" do arrasto não saírem com cores diferentes.
 *
 * As classes são escritas por extenso de propósito: o Tailwind varre o
 * código como texto, então nome de classe montado na hora (`bg-${cor}-500`)
 * não entra no CSS final.
 */
export type EtapaVisual = {
  rotulo: string;
  descricao: string;
  /** Faixa colorida do topo da coluna e do cartão. */
  gradiente: string;
  /** Bolinha do cabeçalho da coluna. */
  contador: string;
  /** Cor do texto do título da coluna. */
  titulo: string;
  /** Fundo da coluna em repouso. */
  coluna: string;
  /** Fundo/anel da coluna quando um pedido está pairando sobre ela. */
  colunaAlvo: string;
  /** Barra lateral do cartão. */
  cartao: string;
};

export const ETAPAS: Record<PedidoStatus, EtapaVisual> = {
  novo: {
    rotulo: "Pronto pra separar",
    descricao: "Chegou agora",
    gradiente: "bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600",
    contador: "bg-sky-500 text-white shadow-sm shadow-sky-500/40",
    titulo: "text-sky-700 dark:text-sky-300",
    coluna: "bg-sky-50/70 border-sky-100 dark:bg-sky-500/5 dark:border-sky-500/20",
    colunaAlvo: "bg-sky-100 border-sky-400 ring-2 ring-sky-400/60 dark:bg-sky-500/15",
    cartao: "before:bg-gradient-to-b before:from-sky-400 before:to-blue-600",
  },
  separando: {
    rotulo: "Separando",
    descricao: "Em preparação",
    gradiente: "bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500",
    contador: "bg-orange-500 text-white shadow-sm shadow-orange-500/40",
    titulo: "text-orange-700 dark:text-orange-300",
    coluna: "bg-amber-50/70 border-amber-100 dark:bg-amber-500/5 dark:border-amber-500/20",
    colunaAlvo: "bg-amber-100 border-orange-400 ring-2 ring-orange-400/60 dark:bg-amber-500/15",
    cartao: "before:bg-gradient-to-b before:from-amber-400 before:to-orange-500",
  },
  pronto: {
    rotulo: "Pronto",
    descricao: "Aguardando saída",
    gradiente: "bg-gradient-to-r from-violet-400 via-violet-500 to-fuchsia-500",
    contador: "bg-violet-500 text-white shadow-sm shadow-violet-500/40",
    titulo: "text-violet-700 dark:text-violet-300",
    coluna: "bg-violet-50/70 border-violet-100 dark:bg-violet-500/5 dark:border-violet-500/20",
    colunaAlvo: "bg-violet-100 border-violet-400 ring-2 ring-violet-400/60 dark:bg-violet-500/15",
    cartao: "before:bg-gradient-to-b before:from-violet-400 before:to-fuchsia-500",
  },
  entregue: {
    rotulo: "Finalizados hoje",
    descricao: "Entregues no dia",
    gradiente: "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500",
    contador: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/40",
    titulo: "text-emerald-700 dark:text-emerald-300",
    coluna: "bg-emerald-50/70 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20",
    colunaAlvo: "bg-emerald-100 border-emerald-400 ring-2 ring-emerald-400/60 dark:bg-emerald-500/15",
    cartao: "before:bg-gradient-to-b before:from-emerald-400 before:to-teal-500",
  },
};

/** Ordem das colunas no quadro, do primeiro ao último passo. */
export const ORDEM_ETAPAS: PedidoStatus[] = ["novo", "separando", "pronto", "entregue"];

/** Valor do `data-alvo` da área de finalizar. */
export const ALVO_FINALIZAR = "finalizar";

/** Status que a área "Finalizar pedido" aplica ao pedido solto nela. */
export const STATUS_FINALIZADO: PedidoStatus = "entregue";
