"use client";

import { CheckCircle2, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALVO_FINALIZAR } from "./paletas";

/**
 * Área de finalizar: barra fixa no rodapé que só aparece enquanto um cartão
 * está sendo arrastado. Soltar o cartão nela conclui o item.
 *
 * Fica acima do widget flutuante da Vitória (z-50) — senão o botão dela
 * virava um ponto morto bem em cima da área de soltar.
 */
export function BarraFinalizar({
  visivel,
  ativa,
  bloqueada,
  titulo,
  instrucao,
  instrucaoAtiva,
  textoBloqueado,
}: {
  /** Há um cartão sendo arrastado. */
  visivel: boolean;
  /** O ponteiro está sobre a barra. */
  ativa: boolean;
  /** O item arrastado já está concluído — a barra não aceita. */
  bloqueada: boolean;
  titulo: string;
  instrucao: string;
  instrucaoAtiva: string;
  textoBloqueado: string;
}) {
  return (
    <div
      data-alvo={visivel && !bloqueada ? ALVO_FINALIZAR : undefined}
      aria-hidden={!visivel}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-4 transition-all duration-200",
        visivel ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      )}
    >
      <div
        className={cn(
          "flex w-full max-w-2xl items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-5 text-center shadow-2xl backdrop-blur transition-all duration-150",
          bloqueada
            ? "border-gray-300 bg-white/90 text-gray-400 dark:border-white/20 dark:bg-navy-800/90"
            : ativa
              ? "scale-[1.03] border-emerald-300 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/40"
              : "border-emerald-400 bg-white/95 text-emerald-600 dark:bg-navy-800/95 dark:text-emerald-400"
        )}
      >
        {bloqueada ? (
          <>
            <CheckCircle2 size={22} className="shrink-0" />
            <span className="text-sm font-semibold">{textoBloqueado}</span>
          </>
        ) : (
          <>
            {ativa ? (
              <CheckCircle2 size={26} className="shrink-0 animate-pulse" />
            ) : (
              <PackageCheck size={26} className="shrink-0" />
            )}
            <div>
              <p className="text-base font-extrabold uppercase tracking-wide">{titulo}</p>
              <p className={cn("text-xs font-medium", ativa ? "text-white/90" : "text-gray-400")}>
                {ativa ? instrucaoAtiva : instrucao}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
