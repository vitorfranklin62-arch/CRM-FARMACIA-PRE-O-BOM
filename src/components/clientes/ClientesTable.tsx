"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MessageSquare, NotebookPen, Search } from "lucide-react";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Textarea, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { formatRelativeTime, maskPhone } from "@/lib/utils";
import type { Cliente } from "@/types/database";

export function ClientesTable({ clientes }: { clientes: Cliente[] }) {
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const router = useRouter();

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    const digitos = termo.replace(/\D/g, "");
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (digitos && c.telefone.replace(/\D/g, "").includes(digitos)) ||
        c.observacoes?.toLowerCase().includes(termo)
    );
  }, [clientes, busca]);

  function openEditor(cliente: Cliente) {
    setEditing(cliente);
    setObservacoes(cliente.observacoes ?? "");
  }

  async function saveObservacoes() {
    if (!editing) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("clientes").update({ observacoes }).eq("id", editing.id);
    await logAudit(supabase, "cliente_observacao_atualizada", "clientes", editing.id);
    setSaving(false);
    setEditing(null);
    router.refresh();
  }

  const columns: Column<Cliente>[] = [
    {
      header: "Cliente",
      accessor: (c) => (
        <div className="flex items-center gap-2.5">
          <Avatar nome={c.nome} fotoUrl={c.foto_url} size={32} />
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{c.nome}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{maskPhone(c.telefone)}</p>
          </div>
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
      accessor: (c) => <span className="text-gray-500 dark:text-gray-400">{formatRelativeTime(c.ultima_interacao)}</span>,
    },
    {
      header: "Observações",
      accessor: (c) => <p className="max-w-xs truncate text-gray-500 dark:text-gray-400">{c.observacoes || "—"}</p>,
    },
    {
      header: "",
      accessor: (c) => (
        <button
          onClick={() => openEditor(c)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
        >
          <NotebookPen size={13} /> Anotar
        </button>
      ),
      className: "text-right",
    },
  ];

  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone ou observação..."
          className="pl-9"
        />
      </div>

      <Table
        columns={columns}
        data={filtrados}
        keyField={(c) => c.id}
        emptyMessage={clientes.length === 0 ? "Nenhum cliente cadastrado." : "Nenhum cliente encontrado."}
      />

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
