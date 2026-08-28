"use client";

import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { alvoDaColuna, type PaletaEtapa } from "./paletas";

/** Coluna do quadro: cabeçalho colorido e área que recebe os cartões soltos. */
export function ColunaKanban({
  status,
  paleta,
  titulo,
  subtitulo,
  contagem,
  ativa,
  vazioTexto,
  ativaTexto = "Solte aqui",
  children,
}: {
  status: string;
  paleta: PaletaEtapa;
  titulo: string;
  subtitulo: string;
  contagem: number;
  /** Um cartão está pairando sobre esta coluna. */
  ativa: boolean;
  vazioTexto: string;
  /** Texto mostrado na coluna vazia enquanto ela é o alvo do arrasto. */
  ativaTexto?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-alvo={alvoDaColuna(status)}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border transition-all duration-150",
        paleta.coluna,
        ativa && paleta.colunaAlvo
      )}
    >
      <div className={cn("h-1.5 w-full", paleta.gradiente)} />

      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="min-w-0">
          <h3 className={cn("truncate text-sm font-bold uppercase tracking-wide", paleta.titulo)}>{titulo}</h3>
          <p className="truncate text-[11px] font-medium text-gray-400 dark:text-gray-500">{subtitulo}</p>
        </div>
        <span
          className={cn(
            "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold",
            paleta.contador
          )}
        >
          {contagem}
        </span>
      </div>

      <div className="flex min-h-[140px] flex-col gap-3 p-3">
        {contagem === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300/70 py-8 text-center dark:border-white/15">
            <Inbox size={18} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
              {ativa ? ativaTexto : vazioTexto}
            </p>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
