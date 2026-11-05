/**
 * Qual aviso automático (chave em `mensagens_automaticas`) uma mudança de
 * etapa do pedido dispara. Sem imports com "@/": roda nos testes do Node.
 *
 * Só AVANÇAR no quadro dispara aviso — voltar o cartão (correção de engano)
 * nunca manda mensagem, pra cliente não receber "pronto" depois de "entregue".
 */
const ORDEM = ["novo", "separando", "pronto", "entregue"] as const;
type Etapa = (typeof ORDEM)[number];

export function eventoDoAvisoDePedido(anterior: string, novo: string, temEndereco: boolean): string | null {
  const de = ORDEM.indexOf(anterior as Etapa);
  const para = ORDEM.indexOf(novo as Etapa);
  if (de < 0 || para < 0 || para <= de) return null;
  if (novo === "separando") return "pedido_separando";
  if (novo === "pronto") return temEndereco ? "pedido_pronto_entrega" : "pedido_pronto_retirada";
  if (novo === "entregue") return "pedido_entregue";
  return null;
}
