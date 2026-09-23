"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MessageSquare, NotebookPen, Plus, Search, Tag as TagIcon, Ban } from "lucide-react";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Textarea, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { cn, formatRelativeTime, maskPhone } from "@/lib/utils";
import { MesclarClientesButton } from "./MesclarClientesButton";
import type { Tag, TagCor } from "@/types/database";
import type { ClienteComTags } from "@/types/relations";
import { ClienteForm } from "./ClienteForm";

const CORES_TAG: { valor: TagCor; label: string }[] = [
  { valor: "blue", label: "Azul" },
  { valor: "green", label: "Verde" },
  { valor: "yellow", label: "Amarelo" },
  { valor: "gray", label: "Cinza" },
  { valor: "red", label: "Vermelho" },
  { valor: "purple", label: "Roxo" },
];

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
  const [novoTagNome, setNovoTagNome] = useState("");
  const [novoTagCor, setNovoTagCor] = useState<TagCor>("blue");
  const [tagErro, setTagErro] = useState<string | null>(null);
  const [tagOcupada, setTagOcupada] = useState<string | null>(null);
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
    setTagErro(null);
    setNovoTagNome("");
    setGerenciandoTagsId(cliente.id);
  }

  async function alternarTag(clienteId: string, tag: Tag, temTag: boolean) {
    setTagOcupada(tag.id);
    const supabase = createClient();
    if (temTag) {
      await supabase.from("cliente_tags").delete().eq("cliente_id", clienteId).eq("tag_id", tag.id);
    } else {
      await supabase.from("cliente_tags").insert({ cliente_id: clienteId, tag_id: tag.id });
    }
    router.refresh();
    setTagOcupada(null);
  }

  async function criarEAtribuirTag(clienteId: string) {
    const nome = novoTagNome.trim();
    if (!nome) return;
    setTagErro(null);
    setTagOcupada("nova");
    const supabase = createClient();
    const { data: novaTag, error } = await supabase
      .from("tags")
      .insert({ nome, cor: novoTagCor })
      .select("*")
      .single();

    if (error || !novaTag) {
      setTagErro(error?.code === "23505" ? "Já existe uma tag com esse nome." : "Não foi possível criar a tag.");
      setTagOcupada(null);
      return;
    }

    await supabase.from("cliente_tags").insert({ cliente_id: clienteId, tag_id: novaTag.id });
    setNovoTagNome("");
    router.refresh();
    setTagOcupada(null);
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
        <button onClick={() => openTagsManager(c)} className="flex max-w-[180px] flex-wrap items-center gap-1 text-left">
          {c.cliente_tags.length === 0 ? (
            <span className="text-xs text-gray-300 dark:text-gray-600">+ adicionar</span>
          ) : (
            c.cliente_tags.map(
              (ct) =>
                ct.tags && (
                  <Badge key={ct.tag_id} variant={ct.tags.cor} className="text-[10px]">
                    {ct.tags.nome}
                  </Badge>
                )
            )
          )}
        </button>
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

      <Modal open={!!gerenciando} onClose={() => setGerenciandoTagsId(null)} title={`Tags — ${gerenciando?.nome ?? ""}`}>
        {gerenciando && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Clique pra marcar/desmarcar. Vale pra todo mundo que usa o painel.
              </p>
              <div className="flex flex-wrap gap-2">
                {tagsDisponiveis.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma tag criada ainda — crie a primeira abaixo.</p>
                )}
                {tagsDisponiveis.map((tag) => {
                  const temTag = gerenciando.cliente_tags.some((ct) => ct.tag_id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={tagOcupada === tag.id}
                      onClick={() => alternarTag(gerenciando.id, tag, temTag)}
                      className="disabled:opacity-50"
                    >
                      <Badge
                        variant={tag.cor}
                        className={cn(
                          "cursor-pointer transition",
                          temTag ? "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-navy-800" : "opacity-50 hover:opacity-80"
                        )}
                      >
                        {tag.nome}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 dark:border-white/10">
              <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Criar nova tag</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={novoTagNome}
                  onChange={(e) => setNovoTagNome(e.target.value)}
                  placeholder="Ex.: VIP, Inadimplente..."
                  maxLength={40}
                  className="max-w-[180px]"
                />
                <Select value={novoTagCor} onChange={(e) => setNovoTagCor(e.target.value as TagCor)} className="max-w-[140px]">
                  {CORES_TAG.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  disabled={!novoTagNome.trim() || tagOcupada === "nova"}
                  onClick={() => criarEAtribuirTag(gerenciando.id)}
                >
                  <Plus size={14} /> Criar e marcar
                </Button>
              </div>
              {tagErro && <p className="mt-2 text-xs text-red-600">{tagErro}</p>}
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setGerenciandoTagsId(null)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ClienteForm open={addingCliente} onClose={() => setAddingCliente(false)} />
    </>
  );
}
