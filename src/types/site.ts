export type CategoriaProduto =
  | "medicamento_isento"
  | "higiene"
  | "dermocosmetico"
  | "infantil"
  | "outros";

export interface ProdutoDestaque {
  id: string;
  nome: string;
  laboratorio: string | null;
  principio_ativo: string | null;
  categoria: CategoriaProduto;
  exige_receita: boolean;
  preco_venda: number;
  preco_promocional: number | null;
  promo_ate: string | null;
  estoque: number;
  imagem_url: string | null;
  destaque_site: boolean;
  ativo: boolean;
  slug: string;
}

export type SecaoSite = "hero" | "promocoes" | "flutuante" | "rodape" | "como_comprar";

export type TipoEventoSite = "clique_whatsapp" | "clique_ifood" | "busca";
