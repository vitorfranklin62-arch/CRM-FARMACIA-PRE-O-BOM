import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/types/database";
import type { ProdutoDestaque } from "@/types/site";
import fallbackJson from "@/data/promocoes-fallback.json";

const fallback = fallbackJson as ProdutoDestaque[];

async function buscarDoSupabase(): Promise<ProdutoDestaque[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const supabase = createSupabaseClient<Database>(url, key);
    const hoje = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("produtos")
      .select(
        "id, nome, laboratorio, principio_ativo, categoria, exige_receita, preco, preco_promocional, promo_ate, estoque, imagem_url, destaque_site, ativo, slug"
      )
      .eq("ativo", true)
      .eq("destaque_site", true)
      .eq("exige_receita", false)
      .gt("estoque", 0)
      .or(`promo_ate.is.null,promo_ate.gte.${hoje}`)
      .order("atualizado_em", { ascending: false })
      .limit(24);

    if (error || !data || data.length === 0) return null;

    return data.map((produto) => ({
      id: produto.id,
      nome: produto.nome,
      laboratorio: produto.laboratorio,
      principio_ativo: produto.principio_ativo,
      categoria: (produto.categoria ?? "outros") as ProdutoDestaque["categoria"],
      exige_receita: produto.exige_receita ?? false,
      preco_venda: Number(produto.preco),
      preco_promocional: produto.preco_promocional != null ? Number(produto.preco_promocional) : null,
      promo_ate: produto.promo_ate,
      estoque: produto.estoque,
      imagem_url: produto.imagem_url,
      destaque_site: produto.destaque_site ?? true,
      ativo: produto.ativo ?? true,
      slug: produto.slug ?? produto.id,
    }));
  } catch {
    return null;
  }
}

const buscarComCache = unstable_cache(buscarDoSupabase, ["produtos-destaque"], {
  revalidate: 300,
  tags: ["produtos-destaque"],
});

/**
 * Produtos em destaque pra home. Sempre tenta o Supabase primeiro (cacheado
 * por 5min); se falhar ou vier vazio, cai pro JSON estático — o site nunca
 * aparece quebrado ou sem promoção nenhuma pro cliente.
 */
export async function getProdutosDestaque(): Promise<{
  produtos: ProdutoDestaque[];
  fonte: "supabase" | "fallback";
}> {
  const doSupabase = await buscarComCache();
  if (doSupabase && doSupabase.length > 0) {
    return { produtos: doSupabase, fonte: "supabase" };
  }
  return { produtos: fallback, fonte: "fallback" };
}
