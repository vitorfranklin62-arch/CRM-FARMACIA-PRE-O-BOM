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

const STATUS_VARIANT = { rascunho: "gray", agendada: "yellow", enviada: "green", pausada: "red" } as const;
const STATUS_LABEL = { rascunho: "Rascunho", agendada: "Em andamento", enviada: "Enviada", pausada: "Pausada" } as const;

export type ResumoEnvio = { enviado: number; falhou: number; sem_whatsapp: number; invalido: number };

export function CampanhasList({
  campanhas,
  userId,
  resumo = {},
}: {
  campanhas: Campanha[];
  userId: string;
  resumo?: Record<string, ResumoEnvio>;
}) {
  const [open, setOpen] = useState(false);
  const [disparando, setDisparando] = useState<string | null>(null);
  const router = useRouter();

  async function handleDisparar(c: Campanha) {
    const pergunta =
      c.status === "pausada"
        ? `Retomar "${c.titulo}"? Quem já recebeu não recebe de novo.`
        : `Disparar "${c.titulo}" agora? O envio é gradual (pausas entre mensagens, só em horário comercial), então pode levar horas.`;
    if (!confirm(pergunta)) return;
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
      accessor: (c) => (
        <div className="space-y-1">
          <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
          {c.status === "pausada" && c.motivo_pausa && (
            <p className="max-w-[16rem] text-xs text-red-500">{c.motivo_pausa}</p>
          )}
        </div>
      ),
    },
    {
      header: "Envios",
      accessor: (c) => {
        const r = resumo[c.id];
        if (!r) return <span className="text-xs text-gray-400">—</span>;
        return (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-green-600">{r.enviado} enviadas</span>
            {r.falhou > 0 && <span className="text-red-500"> · {r.falhou} falhas</span>}
            {r.sem_whatsapp > 0 && <span> · {r.sem_whatsapp} sem WhatsApp</span>}
            {r.invalido > 0 && <span> · {r.invalido} inválidos</span>}
          </p>
        );
      },
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
            <Send size={13} /> {disparando === c.id ? "Disparando..." : c.status === "pausada" ? "Retomar" : "Disparar agora"}
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
