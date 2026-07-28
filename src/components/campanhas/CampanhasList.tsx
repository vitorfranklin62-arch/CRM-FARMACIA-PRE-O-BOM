"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Megaphone, Send } from "lucide-react";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CampanhaForm } from "./CampanhaForm";
import { formatDateTime } from "@/lib/utils";
import type { Campanha } from "@/types/database";

const STATUS_VARIANT = { rascunho: "gray", agendada: "yellow", enviada: "green" } as const;
const STATUS_LABEL = { rascunho: "Rascunho", agendada: "Agendada", enviada: "Enviada" } as const;

export function CampanhasList({ campanhas, userId }: { campanhas: Campanha[]; userId: string }) {
  const [open, setOpen] = useState(false);
  const [disparando, setDisparando] = useState<string | null>(null);
  const router = useRouter();

  async function handleDisparar(c: Campanha) {
    if (!confirm(`Disparar "${c.titulo}" agora pra todos os clientes do público selecionado?`)) return;
    setDisparando(c.id);
    const res = await fetch(`/api/campanhas/${c.id}/disparar`, { method: "POST" });
    setDisparando(null);
    if (!res.ok) {
      alert("Não foi possível disparar a campanha.");
      return;
    }
    router.refresh();
  }

  const columns: Column<Campanha>[] = [
    {
      header: "Campanha",
      accessor: (c) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{c.titulo}</p>
          <p className="max-w-sm truncate text-xs text-gray-400 dark:text-gray-500">{c.mensagem}</p>
        </div>
      ),
    },
    {
      header: "Público",
      accessor: (c) => (
        <span className="text-gray-500 dark:text-gray-400">
          {c.clientes_alvo === "todos" ? "Todos" : `Filtro: ${JSON.stringify(c.filtro_json ?? {})}`}
        </span>
      ),
    },
    {
      header: "Agendada para",
      accessor: (c) => <span className="text-gray-500 dark:text-gray-400">{formatDateTime(c.agendada_para)}</span>,
    },
    {
      header: "Status",
      accessor: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>,
    },
    {
      header: "",
      accessor: (c) =>
        c.status !== "enviada" && (
          <button
            onClick={() => handleDisparar(c)}
            disabled={disparando === c.id}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
          >
            <Send size={13} /> {disparando === c.id ? "Disparando..." : "Disparar agora"}
          </button>
        ),
      className: "text-right",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Campanhas"
        description="Mensagens em massa enviadas via WhatsApp/Instagram."
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={15} /> Nova campanha
          </Button>
        }
      />
      {campanhas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-300">
          <Megaphone size={36} />
          <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma campanha criada ainda.</p>
        </div>
      ) : (
        <Table columns={columns} data={campanhas} keyField={(c) => c.id} />
      )}

      <CampanhaForm open={open} onClose={() => setOpen(false)} userId={userId} />
    </Card>
  );
}
