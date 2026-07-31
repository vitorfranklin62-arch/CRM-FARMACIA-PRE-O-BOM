"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { BairroEntregaForm } from "./BairroEntregaForm";
import type { BairroEntrega } from "@/types/database";

export function EntregaSection({ bairros }: { bairros: BairroEntrega[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BairroEntrega | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(b: BairroEntrega) {
    setEditing(b);
    setFormOpen(true);
  }

  async function toggleAtivo(b: BairroEntrega) {
    setPendingId(b.id);
    const supabase = createClient();
    await supabase.from("bairros_entrega").update({ ativo: !b.ativo }).eq("id", b.id);
    await logAudit(supabase, "bairro_entrega_atualizado", "bairros_entrega", b.id, { ativo: !b.ativo });
    router.refresh();
    setPendingId(null);
  }

  async function handleDelete(b: BairroEntrega) {
    if (!confirm(`Remover "${b.bairro}" das entregas?`)) return;
    setPendingId(b.id);
    const supabase = createClient();
    await supabase.from("bairros_entrega").delete().eq("id", b.id);
    await logAudit(supabase, "bairro_entrega_excluido", "bairros_entrega", b.id, { bairro: b.bairro });
    router.refresh();
    setPendingId(null);
  }

  const columns: Column<BairroEntrega>[] = [
    { header: "Bairro", accessor: (b) => <span className="font-medium text-gray-900 dark:text-white">{b.bairro}</span> },
    { header: "Valor", accessor: (b) => formatCurrency(b.valor) },
    {
      header: "Status",
      accessor: (b) => (
        <button onClick={() => toggleAtivo(b)} disabled={pendingId === b.id} className="disabled:opacity-50">
          <Badge variant={b.ativo ? "green" : "gray"}>{b.ativo ? "Ativo" : "Desativado"}</Badge>
        </button>
      ),
    },
    {
      header: "",
      accessor: (b) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(b)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => handleDelete(b)}
            disabled={pendingId === b.id}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Bairros de entrega"
        description="A IA usa essa tabela pra calcular o valor da entrega quando o cliente pede pra receber em casa."
        action={
          <div className="flex items-center gap-2">
            <div className="hidden h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 sm:flex">
              <Truck size={18} />
            </div>
            <Button size="sm" onClick={openNew}>
              <Plus size={15} /> Adicionar bairro
            </Button>
          </div>
        }
      />
      <Table
        columns={columns}
        data={bairros}
        keyField={(b) => b.id}
        emptyMessage="Nenhum bairro cadastrado ainda — sem isso, a IA não sabe calcular entregas."
      />
      <BairroEntregaForm open={formOpen} onClose={() => setFormOpen(false)} bairroEntrega={editing} />
    </Card>
  );
}
