"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { ehHoje } from "@/lib/utils";
import { ColunaKanban } from "@/components/kanban/ColunaKanban";
import { BarraFinalizar } from "@/components/kanban/BarraFinalizar";
import { CartaoFantasma } from "@/components/kanban/CartaoFantasma";
import { useKanbanArrastar } from "@/components/kanban/useKanbanArrastar";
import { ALVO_FINALIZAR, alvoDaColuna, statusDoAlvo } from "@/components/kanban/paletas";
import { EncomendaCard } from "./EncomendaCard";
import { EncomendaForm } from "./EncomendaForm";
import { ETAPAS, ORDEM_ETAPAS, STATUS_FINALIZADO, STATUS_AVISA_CLIENTE } from "./etapas";
import type { EncomendaComCliente } from "@/types/relations";
import type { EncomendaStatus } from "@/types/database";

type EtapaVisivel = (typeof ORDEM_ETAPAS)[number];

// A coluna de retiradas só mostra o que saiu hoje — sem isso, o histórico
// inteiro ia empilhando e ficava difícil bater o olho no dia.
const SOMENTE_HOJE: Partial<Record<EtapaVisivel, boolean>> = { entregue: true };

export function EncomendasBoard({
  initialEncomendas,
  userId,
}: {
  initialEncomendas: EncomendaComCliente[];
  userId: string;
}) {
  const [encomendas, setEncomendas] = useState(initialEncomendas);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [addingEncomenda, setAddingEncomenda] = useState(false);
  const router = useRouter();

  useEffect(() => setEncomendas(initialEncomendas), [initialEncomendas]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("encomendas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "encomendas" }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const handleUpdateStatus = useCallback(
    async (id: string, status: EncomendaStatus) => {
      const atual = encomendas.find((e) => e.id === id);
      if (!atual || atual.status === status) return;

      setUpdatingId(id);
      setEncomendas((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));

      if (status === STATUS_AVISA_CLIENTE) {
        // Precisa passar pelo servidor: é essa etapa que avisa o cliente por WhatsApp.
        const res = await fetch(`/api/encomendas/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) router.refresh();
      } else {
        const supabase = createClient();
        const { error } = await supabase.from("encomendas").update({ status }).eq("id", id);
        if (error) {
          router.refresh();
        } else {
          await logAudit(supabase, "encomenda_status_atualizado", "encomendas", id, { status });
        }
      }

      setUpdatingId(null);
    },
    [encomendas, router]
  );

  const aoSoltar = useCallback(
    (id: string, alvo: string) => {
      if (alvo === ALVO_FINALIZAR) {
        handleUpdateStatus(id, STATUS_FINALIZADO);
        return;
      }
      const status = statusDoAlvo(alvo);
      if (status) handleUpdateStatus(id, status as EncomendaStatus);
    },
    [handleUpdateStatus]
  );

  const { arrasto, iniciarArrasto } = useKanbanArrastar({ aoSoltar });

  const arrastada = arrasto ? encomendas.find((e) => e.id === arrasto.id) ?? null : null;
  const jaFinalizada = arrastada?.status === STATUS_FINALIZADO;
  const sobreFinalizar = arrasto?.alvo === ALVO_FINALIZAR;

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(() => {
    if (!termo) return encomendas;
    return encomendas.filter(
      (e) =>
        e.clientes?.nome.toLowerCase().includes(termo) ||
        e.produto_nome.toLowerCase().includes(termo) ||
        e.clientes?.telefone.replace(/\D/g, "").includes(termo.replace(/\D/g, ""))
    );
  }, [encomendas, termo]);

  const porEtapa = useMemo(() => {
    const mapa = {} as Record<EtapaVisivel, EncomendaComCliente[]>;
    for (const status of ORDEM_ETAPAS) {
      mapa[status] = filtradas.filter(
        (e) => e.status === status && (!SOMENTE_HOJE[status] || ehHoje(e.atualizado_em))
      );
    }
    return mapa;
  }, [filtradas]);

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, telefone ou produto..."
            className="pl-9"
          />
        </div>
        <Button size="sm" onClick={() => setAddingEncomenda(true)}>
          <Plus size={15} /> Nova encomenda
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ORDEM_ETAPAS.map((status) => {
          const etapa = ETAPAS[status];
          const itens = porEtapa[status];
          const ativa = arrasto?.alvo === alvoDaColuna(status) && arrastada?.status !== status;
          // Soltar em "Chegou" dispara o WhatsApp pro cliente — a coluna avisa
          // disso enquanto está sob o cartão, porque do lado do cliente a
          // mensagem não tem volta.
          const avisaCliente = ativa && status === STATUS_AVISA_CLIENTE;

          return (
            <ColunaKanban
              key={status}
              status={status}
              paleta={etapa}
              titulo={etapa.rotulo}
              subtitulo={avisaCliente ? "O cliente será avisado no WhatsApp" : etapa.descricao}
              contagem={itens.length}
              ativa={ativa}
              vazioTexto="Nenhuma encomenda"
              ativaTexto={avisaCliente ? "Solte para avisar o cliente" : "Solte aqui"}
            >
              {itens.map((encomenda) => (
                <EncomendaCard
                  key={encomenda.id}
                  encomenda={encomenda}
                  onUpdateStatus={handleUpdateStatus}
                  updating={updatingId === encomenda.id}
                  arrastando={arrasto?.id === encomenda.id}
                  aoIniciarArrasto={(evento) =>
                    iniciarArrasto(evento, { id: encomenda.id, origem: encomenda.status })
                  }
                />
              ))}
            </ColunaKanban>
          );
        })}
      </div>

      <BarraFinalizar
        visivel={!!arrasto}
        ativa={sobreFinalizar}
        bloqueada={jaFinalizada}
        titulo="Finalizar encomenda"
        instrucao="Arraste até aqui para concluir"
        instrucaoAtiva="Solte para marcar como retirada"
        textoBloqueado="Esta encomenda já foi retirada"
      />

      {arrasto && arrastada && (
        <CartaoFantasma arrasto={arrasto} encolhido={sobreFinalizar && !jaFinalizada}>
          <EncomendaCard encomenda={arrastada} onUpdateStatus={() => {}} updating={false} fantasma />
        </CartaoFantasma>
      )}

      <EncomendaForm open={addingEncomenda} onClose={() => setAddingEncomenda(false)} userId={userId} />
    </div>
  );
}
