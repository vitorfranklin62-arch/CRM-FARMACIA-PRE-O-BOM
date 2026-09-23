"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MessageSquare, NotebookPen, Plus, Search, Tag as TagIcon, Ban } from "lucide-react";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Textarea, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { formatRelativeTime, maskPhone } from "@/lib/utils";
import { MesclarClientesButton } from "./MesclarClientesButton";
import { TagPills } from "./TagPills";
import { TagsManagerModal } from "./TagsManagerModal";
import type { Tag } from "@/types/database";
import type { ClienteComTags } from "@/types/relations";
import { ClienteForm } from "./ClienteForm";

export function ClientesTable({
  clientes,
  tagsDisponiveis,
}: {
  clientes: ClienteComTags[];
  tagsDisponiveis: Tag[];
}) {
  const [editing, setEditing] = useState<ClienteComTags | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [addingCliente, setAddingCliente] = useState(false);
  const [gerenciandoTagsId, setGerenciandoTagsId] = useState<string | null>(null);
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

  function openEditor(cliente: ClienteComTags) {
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

  // Guarda só o id: assim, depois de um router.refresh() (toggle de tag,
  // tag nova criada), o modal continua aberto mostrando os dados atualizados
  // — em vez de ficar preso na foto do cliente no momento em que abriu.
  const gerenciando = clientes.find((c) => c.id === gerenciandoTagsId) ?? null;

  function openTagsManager(cliente: ClienteComTags) {
    setGerenciandoTagsId(cliente.id);
  }

  const columns: Column<ClienteComTags>[] = [
    {
      header: "Cliente",
      accessor: (c) => (
        <div className="flex items-center gap-2.5">
          <Avatar nome={c.nome} fotoUrl={c.foto_url} size={32} />
          <div>
            <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
              {c.nome}
              {c.ia_bloqueada && <Ban size={12} className="shrink-0 text-red-500 dark:text-red-400" aria-label="IA bloqueada" />}
            </p>
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
      header: "Tags",
      accessor: (c) => (
        <TagPills tags={c.cliente_tags} onClick={() => openTagsManager(c)} emptyLabel="+ adicionar" className="max-w-[180px]" />
      ),
    },
    {
      header: "",
      accessor: (c) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openTagsManager(c)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            <TagIcon size={13} /> Tags
          </button>
          <button
            onClick={() => openEditor(c)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            <NotebookPen size={13} /> Anotar
          </button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou observação..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <MesclarClientesButton />
          <Button size="sm" onClick={() => setAddingCliente(true)}>
            <Plus size={15} /> Adicionar cliente
          </Button>
        </div>
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

      {gerenciando && (
        <TagsManagerModal
          open={!!gerenciando}
          onClose={() => setGerenciandoTagsId(null)}
          clienteId={gerenciando.id}
          clienteNome={gerenciando.nome}
          tagsAtuais={gerenciando.cliente_tags}
          tagsDisponiveis={tagsDisponiveis}
        />
      )}

      <ClienteForm open={addingCliente} onClose={() => setAddingCliente(false)} />
    </>
  );
}
