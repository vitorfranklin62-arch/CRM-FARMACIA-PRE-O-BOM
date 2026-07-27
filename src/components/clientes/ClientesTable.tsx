"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MessageSquare, NotebookPen } from "lucide-react";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime, maskPhone } from "@/lib/utils";
import type { Cliente } from "@/types/database";

export function ClientesTable({ clientes }: { clientes: Cliente[] }) {
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function openEditor(cliente: Cliente) {
    setEditing(cliente);
    setObservacoes(cliente.observacoes ?? "");
  }

  async function saveObservacoes() {
    if (!editing) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("clientes").update({ observacoes }).eq("id", editing.id);
    setSaving(false);
    setEditing(null);
    router.refresh();
  }

  const columns: Column<Cliente>[] = [
    {
      header: "Cliente",
      accessor: (c) => (
        <div>
          <p className="font-medium text-gray-900">{c.nome}</p>
          <p className="text-xs text-gray-400">{maskPhone(c.telefone)}</p>
        </div>
      ),
    },
    {
      header: "Origem",
      accessor: (c) => (
        <Badge variant={c.origem_chat === "instagram" ? "purple" : "green"}>
          <span className="flex items-center gap-1">
            {c.origem_chat === "instagram" ? <Camera size={11} /> : <MessageSquare size={11} />}
            {c.origem_chat === "instagram" ? "Instagram" : "WhatsApp"}
          </span>
        </Badge>
      ),
    },
    {
      header: "Última interação",
      accessor: (c) => <span className="text-gray-500">{formatRelativeTime(c.ultima_interacao)}</span>,
    },
    {
      header: "Observações",
      accessor: (c) => <p className="max-w-xs truncate text-gray-500">{c.observacoes || "—"}</p>,
    },
    {
      header: "",
      accessor: (c) => (
        <button
          onClick={() => openEditor(c)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
        >
          <NotebookPen size={13} /> Anotar
        </button>
      ),
      className: "text-right",
    },
  ];

  return (
    <>
      <Table columns={columns} data={clientes} keyField={(c) => c.id} emptyMessage="Nenhum cliente cadastrado." />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Observações — ${editing?.nome ?? ""}`}>
        <Textarea
          rows={5}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Anote preferências, alergias, combinados..."
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Cancelar
          </Button>
          <Button onClick={saveObservacoes} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
