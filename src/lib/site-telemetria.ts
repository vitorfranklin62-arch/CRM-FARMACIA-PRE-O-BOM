"use client";

import type { SecaoSite, TipoEventoSite } from "@/types/site";

interface RegistrarEventoParams {
  tipo: TipoEventoSite;
  produtoId?: string;
  secao?: SecaoSite;
  termo?: string;
}

/**
 * Registra um evento de conversão (clique WhatsApp/iFood ou busca) sem bloquear a navegação.
 * Usa sendBeacon quando disponível — o clique já abre o WhatsApp/iFood antes da resposta chegar.
 */
export function registrarEventoSite({ tipo, produtoId, secao, termo }: RegistrarEventoParams): void {
  try {
    const payload = JSON.stringify({
      tipo,
      produto_id: produtoId ?? null,
      secao: secao ?? null,
      termo: termo ?? null,
    });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/site/evento", blob);
      return;
    }

    fetch("/api/site/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // telemetria nunca pode quebrar a navegação do cliente
  }
}
