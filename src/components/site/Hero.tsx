import { horarioDeHoje } from "@/lib/horario-loja";
import { WhatsAppButton } from "./WhatsAppButton";

export function Hero() {
  const hoje = horarioDeHoje();

  return (
    <section className="relative overflow-hidden bg-site-azul-marinho font-site text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-site-amarelo-etiqueta">
          Farmácia Preço Bom
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
          Remédio bom, preço bom e resposta na hora no WhatsApp.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/80">
          Peça pelo WhatsApp e receba em casa, em qualquer bairro de Salvador. Sem fila, sem enrolação.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium">
            🚚 Entrega para toda Salvador
          </span>
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium">
            🕐 Aberto até {hoje.fechamento}
          </span>
        </div>

        <div className="mt-8">
          <WhatsAppButton secao="hero" size="lg">
            Chamar no WhatsApp
          </WhatsAppButton>
        </div>
      </div>

      {/* sentinela: quando sair da tela, o botão flutuante de WhatsApp aparece */}
      <div id="hero-sentinela" aria-hidden className="h-px w-full" />
    </section>
  );
}
