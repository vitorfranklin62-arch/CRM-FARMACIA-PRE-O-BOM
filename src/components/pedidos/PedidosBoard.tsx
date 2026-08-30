"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { ehHoje, formatCurrency } from "@/lib/utils";
import { ColunaKanban } from "@/components/kanban/ColunaKanban";
import { BarraFinalizar } from "@/components/kanban/BarraFinalizar";
import { CartaoFantasma } from "@/components/kanban/CartaoFantasma";
import { useKanbanArrastar } from "@/components/kanban/useKanbanArrastar";
import { ALVO_FINALIZAR, alvoDaColuna, statusDoAlvo } from "@/components/kanban/paletas";
import { PedidoCard } from "./PedidoCard";
import { ETAPAS, ORDEM_ETAPAS, STATUS_FINALIZADO } from "./etapas";
import type { PedidoCompleto } from "@/types/relations";
import type { PedidoStatus } from "@/types/database";

// A coluna de finalizados só mostra o que saiu hoje — sem isso, o histórico
// inteiro ia empilhando e ficava difícil bater o olho no dia. O pedido
// continua no banco pro dashboard, só some da coluna.
const SOMENTE_HOJE: Partial<Record<PedidoStatus, boolean>> = { entregue: true };

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
      const status = statusDoAlvo(alvo);
      if (status) handleUpdateStatus(id, status as PedidoStatus);
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
          const total = itens.reduce((soma, p) => soma + Number(p.total ?? 0), 0);

          return (
            <ColunaKanban
              key={status}
              status={status}
              paleta={etapa}
              titulo={etapa.rotulo}
              subtitulo={`${etapa.descricao} · ${formatCurrency(total)}`}
              contagem={itens.length}
              ativa={arrasto?.alvo === alvoDaColuna(status) && pedidoArrastado?.status !== status}
              vazioTexto="Nenhum pedido"
            >
              {itens.map((pedido) => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  onUpdateStatus={handleUpdateStatus}
                  updating={updatingId === pedido.id}
                  arrastando={arrasto?.id === pedido.id}
                  aoIniciarArrasto={(evento) => iniciarArrasto(evento, { id: pedido.id, origem: pedido.status })}
                />
              ))}
            </ColunaKanban>
          );
        })}
      </div>

      <BarraFinalizar
        visivel={!!arrasto}
        ativa={sobreFinalizar}
        bloqueada={jaFinalizado}
        titulo="Finalizar pedido"
        instrucao="Arraste até aqui para concluir"
        instrucaoAtiva="Solte para concluir a entrega"
        textoBloqueado="Este pedido já está finalizado"
      />

      {arrasto && pedidoArrastado && (
        <CartaoFantasma arrasto={arrasto} encolhido={sobreFinalizar && !jaFinalizado}>
          <PedidoCard pedido={pedidoArrastado} onUpdateStatus={() => {}} updating={false} fantasma />
        </CartaoFantasma>
      )}
    </div>
  );
}
