import { loja } from "@/config/loja";
import type { ProdutoDestaque, SecaoSite } from "@/types/site";
import { formatCurrency } from "@/lib/utils";

interface GerarLinkWhatsAppParams {
  produto?: Pick<ProdutoDestaque, "nome"> & { preco?: number };
  termoBusca?: string;
  secao: SecaoSite;
}

function montarMensagem({ produto, termoBusca }: Pick<GerarLinkWhatsAppParams, "produto" | "termoBusca">): string {
  if (produto) {
    const preco = produto.preco ?? undefined;
    const precoTexto = preco != null ? ` por ${formatCurrency(preco)}` : "";
    return `Olá! Vim pelo site e quero o ${produto.nome}${precoTexto}. Ainda está disponível?`;
  }

  if (termoBusca) {
    return `Olá! Vim pelo site e procuro por ${termoBusca}. Vocês têm em estoque?`;
  }

  return "Olá! Vim pelo site e gostaria de fazer um pedido.";
}

/**
 * Monta o link wa.me com mensagem pré-preenchida de acordo com o contexto do clique.
 * `secao` não entra na mensagem — é usado por quem chama esta função pra registrar a telemetria.
 */
export function gerarLinkWhatsApp(params: GerarLinkWhatsAppParams): string {
  const mensagem = montarMensagem(params);
  return `https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}
