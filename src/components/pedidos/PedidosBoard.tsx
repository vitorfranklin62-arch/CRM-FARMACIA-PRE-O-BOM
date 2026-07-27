"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PedidoCard } from "./PedidoCard";
import type { PedidoCompleto } from "@/types/relations";
import type { PedidoStatus } from "@/types/database";

const COLUMNS: { status: PedidoStatus; label: string }[] = [
  { status: "novo", label: "Pronto pra separar" },
  { status: "separando", label: "Separando" },
  { status: "pronto", label: "Pronto" },
  { status: "entregue", label: "Entregue" },
];

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

  async function handleUpdateStatus(id: string, status: PedidoStatus) {
    setUpdatingId(id);
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));

    const supabase = createClient();
    const { error } = await supabase.from("pedidos").update({ status }).eq("id", id);

    if (error) {
      router.refresh();
    }
    setUpdatingId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = pedidos.filter((p) => p.status === col.status);
        return (
          <div key={col.status} className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {items.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
                  Nenhum pedido
                </p>
              )}
              {items.map((pedido) => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  onUpdateStatus={handleUpdateStatus}
                  updating={updatingId === pedido.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
