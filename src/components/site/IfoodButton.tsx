"use client";

import { loja } from "@/config/loja";
import { registrarEventoSite } from "@/lib/site-telemetria";
import { cn } from "@/lib/utils";

export function IfoodButton({ className }: { className?: string }) {
  return (
    <a
      href={loja.ifoodUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => registrarEventoSite({ tipo: "clique_ifood", secao: "como_comprar" })}
      aria-label="Pedir pelo iFood"
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-site-azul-marinho px-5 py-3 text-base font-semibold text-site-azul-marinho transition-colors hover:bg-site-azul-marinho hover:text-white",
        className
      )}
    >
      Prefere pedir pelo iFood?
    </a>
  );
}
