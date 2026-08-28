"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { ehHoje, cn, formatCurrency } from "@/lib/utils";
import { PedidoCard } from "./PedidoCard";
import { useKanbanArrastar } from "./useKanbanArrastar";
import { ETAPAS, ORDEM_ETAPAS, ALVO_FINALIZAR, STATUS_FINALIZADO } from "./kanban-config";
import type { PedidoCompleto } from "@/types/relations";
import type { PedidoStatus } from "@/types/database";

// A coluna de finalizados só mostra o que saiu hoje — sem isso, o histórico
// inteiro ia empilhando e ficava difícil bater o olho no dia. O pedido
// continua no banco pro dashboard, só some da coluna.
const SOMENTE_HOJE: Partial<Record<PedidoStatus, boolean>> = { entregue: true };

const PREFIXO_COLUNA = "coluna:";

export function PedidosBoard({ initialPedidos }: { initialPedidos: PedidoCompleto[] }) {
  const [pedidos, setPedidos] = useState(initialPedidos);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => setPedidos(initialPedidos), [initialPedidos]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pedidos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const handleUpdateStatus = useCallback(
    async (id: string, status: PedidoStatus) => {
      const atual = pedidos.find((p) => p.id === id);
      if (!atual || atual.status === status) return;

      setUpdatingId(id);
      // Move na tela na hora e só depois confirma no banco — o balcão não
      // pode ficar esperando a ida e volta pra ver o cartão sair do lugar.
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));

      const supabase = createClient();
      const { error } = await supabase.from("pedidos").update({ status }).eq("id", id);

      if (error) {
        router.refresh();
      } else {
        await logAudit(supabase, "pedido_status_atualizado", "pedidos", id, { status });
      }
      setUpdatingId(null);
    },
    [pedidos, router]
  );

  const aoSoltar = useCallback(
    (id: string, alvo: string) => {
      if (alvo === ALVO_FINALIZAR) {
        handleUpdateStatus(id, STATUS_FINALIZADO);
        return;
      }
      if (alvo.startsWith(PREFIXO_COLUNA)) {
        handleUpdateStatus(id, alvo.slice(PREFIXO_COLUNA.length) as PedidoStatus);
      }
    },
    [handleUpdateStatus]
  );

  const { arrasto, iniciarArrasto } = useKanbanArrastar({ aoSoltar });

  const pedidoArrastado = arrasto ? pedidos.find((p) => p.id === arrasto.id) ?? null : null;
  const jaFinalizado = pedidoArrastado?.status === STATUS_FINALIZADO;
  const sobreFinalizar = arrasto?.alvo === ALVO_FINALIZAR;

  const porEtapa = useMemo(() => {
    const mapa = {} as Record<PedidoStatus, PedidoCompleto[]>;
    for (const status of ORDEM_ETAPAS) {
      mapa[status] = pedidos.filter(
        (p) => p.status === status && (!SOMENTE_HOJE[status] || ehHoje(p.atualizado_em))
      );
    }
    return mapa;
  }, [pedidos]);

  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ORDEM_ETAPAS.map((status) => {
          const etapa = ETAPAS[status];
          const itens = porEtapa[status];
          const alvoAtivo = arrasto?.alvo === `${PREFIXO_COLUNA}${status}` && pedidoArrastado?.status !== status;
          const total = itens.reduce((soma, p) => soma + Number(p.total ?? 0), 0);

          return (
            <section
              key={status}
              data-alvo={`${PREFIXO_COLUNA}${status}`}
              className={cn(
                "flex flex-col overflow-hidden rounded-2xl border transition-all duration-150",
                etapa.coluna,
                alvoAtivo && etapa.colunaAlvo
              )}
            >
              <div className={cn("h-1.5 w-full", etapa.gradiente)} />

              <div className="flex items-center justify-between gap-2 px-3 pt-3">
                <div className="min-w-0">
                  <h3 className={cn("truncate text-sm font-bold uppercase tracking-wide", etapa.titulo)}>
                    {etapa.rotulo}
                  </h3>
                  <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    {etapa.descricao} · {formatCurrency(total)}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold",
                    etapa.contador
                  )}
                >
                  {itens.length}
                </span>
              </div>

              <div className="flex min-h-[140px] flex-col gap-3 p-3">
                {itens.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300/70 py-8 text-center dark:border-white/15">
                    <Inbox size={18} className="text-gray-300 dark:text-gray-600" />
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                      {alvoAtivo ? "Solte aqui" : "Nenhum pedido"}
                    </p>
                  </div>
                )}
                {itens.map((pedido) => (
                  <PedidoCard
                    key={pedido.id}
                    pedido={pedido}
                    onUpdateStatus={handleUpdateStatus}
                    updating={updatingId === pedido.id}
                    arrastando={arrasto?.id === pedido.id}
                    aoIniciarArrasto={(evento) =>
                      iniciarArrasto(evento, { id: pedido.id, origem: pedido.status })
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Área de finalizar: só aparece com um pedido na mão. Fica acima do
          widget flutuante da Vitória (z-50) — senão o botão dela virava um
          ponto morto bem em cima da área de soltar. */}
      <div
        data-alvo={arrasto && !jaFinalizado ? ALVO_FINALIZAR : undefined}
        aria-hidden={!arrasto}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-4 transition-all duration-200",
          arrasto ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        )}
      >
        <div
          className={cn(
            "flex w-full max-w-2xl items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-5 text-center shadow-2xl backdrop-blur transition-all duration-150",
            jaFinalizado
              ? "border-gray-300 bg-white/90 text-gray-400 dark:border-white/20 dark:bg-navy-800/90"
              : sobreFinalizar
                ? "scale-[1.03] border-emerald-300 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/40"
                : "border-emerald-400 bg-white/95 text-emerald-600 dark:bg-navy-800/95 dark:text-emerald-400"
          )}
        >
          {jaFinalizado ? (
            <>
              <CheckCircle2 size={22} className="shrink-0" />
              <span className="text-sm font-semibold">Este pedido já está finalizado</span>
            </>
          ) : (
            <>
              {sobreFinalizar ? (
                <CheckCircle2 size={26} className="shrink-0 animate-pulse" />
              ) : (
                <PackageCheck size={26} className="shrink-0" />
              )}
              <div>
                <p className="text-base font-extrabold uppercase tracking-wide">Finalizar pedido</p>
                <p className={cn("text-xs font-medium", sobreFinalizar ? "text-white/90" : "text-gray-400")}>
                  {sobreFinalizar ? "Solte para concluir a entrega" : "Arraste até aqui para concluir"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cópia do cartão acompanhando o ponteiro. */}
      {arrasto && pedidoArrastado && (
        <div
          className="pointer-events-none fixed z-[70] transition-transform duration-150"
          style={{
            left: arrasto.x - arrasto.deslocX,
            top: arrasto.y - arrasto.deslocY,
            width: arrasto.largura,
            // Sobre a área de finalizar o cartão encolhe na direção do
            // ponteiro: sem isso ele tapava justamente o texto que confirma
            // o que vai acontecer ao soltar.
            transformOrigin: `${arrasto.deslocX}px ${arrasto.deslocY}px`,
            transform: sobreFinalizar && !jaFinalizado ? "scale(0.45)" : undefined,
          }}
        >
          <PedidoCard pedido={pedidoArrastado} onUpdateStatus={() => {}} updating={false} fantasma />
        </div>
      )}
    </div>
  );
}
