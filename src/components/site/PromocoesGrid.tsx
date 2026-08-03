import type { ProdutoDestaque } from "@/types/site";
import { PromoCard } from "./PromoCard";

export function PromocoesGrid({ produtos }: { produtos: ProdutoDestaque[] }) {
  if (produtos.length === 0) return null;

  return (
    <section id="promocoes" className="bg-site-azul-marinho py-14 font-site md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <h2 className="font-display text-2xl font-extrabold text-white md:text-3xl">Promoções em destaque</h2>
        <p className="mt-1 text-white/70">Preço já com desconto — só chamar no WhatsApp e confirmar.</p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {produtos.map((produto, index) => (
            <PromoCard key={produto.id} produto={produto} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
