"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { ehHoje } from "@/lib/utils";
import { EncomendaCard } from "./EncomendaCard";
import { EncomendaForm } from "./EncomendaForm";
import type { EncomendaComCliente } from "@/types/relations";
import type { EncomendaStatus } from "@/types/database";

const COLUMNS: { status: EncomendaStatus; label: string; somenteHoje?: boolean }[] = [
  { status: "pendente", label: "Aguardando chegar" },
  { status: "chegou", label: "Chegou" },
  { status: "entregue", label: "Retirada hoje", somenteHoje: true },
];

export function EncomendasBoard({ initialEncomendas, userId }: { initialEncomendas: EncomendaComCliente[]; userId: string }) {
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

  async function handleUpdateStatus(id: string, status: EncomendaStatus) {
    setUpdatingId(id);
    setEncomendas((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));

    if (status === "chegou") {
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
  }

  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? encomendas.filter(
        (e) =>
          e.clientes?.nome.toLowerCase().includes(termo) ||
          e.produto_nome.toLowerCase().includes(termo) ||
          e.clientes?.telefone.replace(/\D/g, "").includes(termo.replace(/\D/g, ""))
      )
    : encomendas;

  return (
    <>
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
        {COLUMNS.map((col) => {
          const items = filtradas.filter(
            (e) => e.status === col.status && (!col.somenteHoje || ehHoje(e.atualizado_em))
          );
          return (
            <div key={col.status} className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{col.label}</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400 dark:border-white/10 dark:text-gray-500">
                    Nenhuma encomenda
                  </p>
                )}
                {items.map((encomenda) => (
                  <EncomendaCard
                    key={encomenda.id}
                    encomenda={encomenda}
                    onUpdateStatus={handleUpdateStatus}
                    updating={updatingId === encomenda.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <EncomendaForm open={addingEncomenda} onClose={() => setAddingEncomenda(false)} userId={userId} />
    </>
  );
}
