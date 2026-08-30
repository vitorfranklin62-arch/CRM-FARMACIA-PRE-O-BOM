import { PALETAS, type PaletaEtapa } from "@/components/kanban/paletas";
import type { PedidoStatus } from "@/types/database";

export type EtapaPedido = PaletaEtapa & { rotulo: string; descricao: string };

/** Identidade de cada etapa do quadro de pedidos. */
export const ETAPAS: Record<PedidoStatus, EtapaPedido> = {
  novo: { ...PALETAS.azul, rotulo: "Pronto pra separar", descricao: "Chegou agora" },
  separando: { ...PALETAS.laranja, rotulo: "Separando", descricao: "Em preparação" },
  pronto: { ...PALETAS.violeta, rotulo: "Pronto", descricao: "Aguardando saída" },
  entregue: { ...PALETAS.verde, rotulo: "Finalizados hoje", descricao: "Entregues no dia" },
};

/** Ordem das colunas, do primeiro ao último passo. */
export const ORDEM_ETAPAS: PedidoStatus[] = ["novo", "separando", "pronto", "entregue"];

/** Status que a área "Finalizar pedido" aplica ao pedido solto nela. */
export const STATUS_FINALIZADO: PedidoStatus = "entregue";
