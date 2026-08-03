import { Activity, Droplet, Syringe, Smartphone, Ticket } from "lucide-react";
import { loja } from "@/config/loja";

const icones = [Activity, Droplet, Syringe, Smartphone, Ticket];

export function Servicos() {
  return (
    <section className="bg-white py-14 font-site md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <h2 className="font-display text-2xl font-extrabold text-site-azul-marinho md:text-3xl">
          Serviços na loja
        </h2>

        <div data-reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {loja.servicos.map((servico, index) => {
            const Icone = icones[index];
            return (
              <div key={servico.nome} className="rounded-2xl bg-site-nuvem p-5 text-center">
                <Icone className="mx-auto h-8 w-8 text-site-azul-marinho" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-site-grafite">{servico.nome}</p>
                {servico.somenteDinheiro && (
                  <p className="mt-1 text-xs text-site-vermelho-off">Somente em dinheiro</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
