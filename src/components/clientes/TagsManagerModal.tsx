"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Tag, TagCor } from "@/types/database";
import type { ClienteTagComTag } from "@/types/relations";

export const CORES_TAG: { valor: TagCor; label: string }[] = [
  { valor: "blue", label: "Azul" },
  { valor: "green", label: "Verde" },
  { valor: "yellow", label: "Amarelo" },
  { valor: "gray", label: "Cinza" },
  { valor: "red", label: "Vermelho" },
  { valor: "purple", label: "Roxo" },
];

/**
 * Modal de gerenciar tags de um cliente — marcar/desmarcar tags existentes
 * ou criar uma nova na hora. Usado tanto na tela de Clientes quanto no
 * cabeçalho do Chat ao vivo, sempre com a mesma aparência e comportamento.
 *
 * Recebe `tagsAtuais` do cliente vindas de fora (não guarda cópia própria)
 * — assim, depois de um `router.refresh()`, o modal continua aberto já
 * mostrando o estado novo, em vez de ficar preso na foto de quando abriu.
 */
export function TagsManagerModal({
  open,
  onClose,
  clienteId,
  clienteNome,
  tagsAtuais,
  tagsDisponiveis,
}: {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNome: string;
  tagsAtuais: ClienteTagComTag[];
  tagsDisponiveis: Tag[];
}) {
  const [novoTagNome, setNovoTagNome] = useState("");
  const [novoTagCor, setNovoTagCor] = useState<TagCor>("blue");
  const [tagErro, setTagErro] = useState<string | null>(null);
  const [tagOcupada, setTagOcupada] = useState<string | null>(null);
  const router = useRouter();

  async function alternarTag(tag: Tag, temTag: boolean) {
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

  async function criarEAtribuirTag() {
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

  return (
    <Modal open={open} onClose={onClose} title={`Tags — ${clienteNome}`}>
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
              const temTag = tagsAtuais.some((ct) => ct.tag_id === tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={tagOcupada === tag.id}
                  onClick={() => alternarTag(tag, temTag)}
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
            <Button type="button" size="sm" disabled={!novoTagNome.trim() || tagOcupada === "nova"} onClick={criarEAtribuirTag}>
              <Plus size={14} /> Criar e marcar
            </Button>
          </div>
          {tagErro && <p className="mt-2 text-xs text-red-600">{tagErro}</p>}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
