import { PALETAS, type PaletaEtapa } from "@/components/kanban/paletas";
import type { EncomendaStatus } from "@/types/database";

export type EtapaEncomenda = PaletaEtapa & { rotulo: string; descricao: string };

/**
 * Identidade de cada etapa do quadro de encomendas.
 *
 * `cancelada` não tem coluna: a encomenda cancelada sai do quadro (a página
 * nem carrega canceladas). Por isso o mapa cobre só as três etapas visíveis.
 */
export const ETAPAS: Record<Exclude<EncomendaStatus, "cancelada">, EtapaEncomenda> = {
  pendente: { ...PALETAS.laranja, rotulo: "Aguardando chegar", descricao: "Pedida ao fornecedor" },
  chegou: { ...PALETAS.azul, rotulo: "Chegou", descricao: "Cliente avisado" },
  entregue: { ...PALETAS.verde, rotulo: "Retiradas hoje", descricao: "Entregues no dia" },
};

/** Ordem das colunas, do primeiro ao último passo. */
export const ORDEM_ETAPAS = ["pendente", "chegou", "entregue"] as const;

/** Status que a área "Finalizar encomenda" aplica à encomenda solta nela. */
export const STATUS_FINALIZADO: EncomendaStatus = "entregue";

/**
 * Marcar como "chegou" dispara o aviso por WhatsApp pro cliente. Como agora
 * dá pra chegar nesse status arrastando, a coluna avisa disso enquanto é o
 * alvo do arrasto — a ação é irreversível do lado do cliente.
 */
export const STATUS_AVISA_CLIENTE: EncomendaStatus = "chegou";
