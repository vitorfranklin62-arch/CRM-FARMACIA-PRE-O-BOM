import { MessageSquareText, Truck, ListChecks } from "lucide-react";
import { loja } from "@/config/loja";
import { WhatsAppButton } from "./WhatsAppButton";
import { IfoodButton } from "./IfoodButton";

const passos = [
  { titulo: "Escolha", descricao: "Veja as promoções ou procure o que precisa no site.", Icone: ListChecks },
  { titulo: "Chame no WhatsApp", descricao: "Confirme o produto e o pagamento com a gente.", Icone: MessageSquareText },
  { titulo: "Receba em casa", descricao: "Entrega para toda Salvador.", Icone: Truck },
];

export function ComoComprar() {
  return (
    <section id="como-comprar" className="bg-site-nuvem py-14 font-site md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <h2 className="font-display text-2xl font-extrabold text-site-azul-marinho md:text-3xl">Como comprar</h2>

        <div data-reveal className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {passos.map(({ titulo, descricao, Icone }, index) => (
            <div key={titulo} className="rounded-2xl bg-white p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-site-azul-marinho text-sm font-bold text-white">
                  {index + 1}
                </span>
                <Icone className="h-6 w-6 text-site-azul-marinho" aria-hidden />
              </div>
              <h3 className="mt-3 font-semibold text-site-grafite">{titulo}</h3>
              <p className="mt-1 text-sm text-site-grafite/70">{descricao}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 rounded-2xl bg-white p-6 shadow-card md:grid-cols-2 md:p-8">
          <div>
            <h3 className="font-semibold text-site-grafite">Formas de pagamento</h3>
            <ul className="mt-2 space-y-1 text-sm text-site-grafite/80">
              {loja.pagamento.formas.map((forma) => (
                <li key={forma}>• {forma}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-site-grafite">Parcelamento no crédito</h3>
            <ul className="mt-2 space-y-1 text-sm text-site-grafite/80">
              {loja.pagamento.parcelamento.map((condicao) => (
                <li key={condicao}>• {condicao}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <WhatsAppButton secao="como_comprar">Chamar no WhatsApp</WhatsAppButton>
          <IfoodButton />
        </div>
      </div>
    </section>
  );
}
