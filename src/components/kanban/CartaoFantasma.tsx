"use client";

import type { Arrasto } from "./useKanbanArrastar";

/** Cópia do cartão que acompanha o ponteiro durante o arrasto. */
export function CartaoFantasma({
  arrasto,
  encolhido,
  children,
}: {
  arrasto: Arrasto;
  /** Encolhe a cópia (usado sobre a área de finalizar). */
  encolhido: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none fixed z-[70] transition-transform duration-150"
      style={{
        left: arrasto.x - arrasto.deslocX,
        top: arrasto.y - arrasto.deslocY,
        width: arrasto.largura,
        // Sobre a área de finalizar o cartão encolhe na direção do ponteiro:
        // sem isso ele tapava justamente o texto que confirma o que vai
        // acontecer ao soltar.
        transformOrigin: `${arrasto.deslocX}px ${arrasto.deslocY}px`,
        transform: encolhido ? "scale(0.45)" : undefined,
      }}
    >
      {children}
    </div>
  );
}
