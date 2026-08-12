"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { clienteCreateSchema } from "@/lib/validation";
import { normalizarTelefone } from "@/lib/telefone";
import type { OrigemChat } from "@/types/database";

export function ClienteForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [origemChat, setOrigemChat] = useState<OrigemChat>("whatsapp");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setNome("");
      setTelefone("");
      setOrigemChat("whatsapp");
      setObservacoes("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = clienteCreateSchema.safeParse({
      nome,
      telefone,
      origem_chat: origemChat,
      observacoes: observacoes || null,
    });

    if (!parsed.success) {
      setError("Preencha nome e telefone corretamente (telefone precisa ter pelo menos 8 dígitos).");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("clientes")
      .insert({
        nome: parsed.data.nome,
        telefone: normalizarTelefone(parsed.data.telefone),
        origem_chat: parsed.data.origem_chat ?? null,
        observacoes: parsed.data.observacoes ?? null,
      })
      .select("id")
      .single();
    setSaving(false);

    if (dbError) {
      setError(dbError.code === "23505" ? "Já existe um cliente com esse telefone." : "Não foi possível salvar o cliente.");
      return;
    }

    await logAudit(supabase, "cliente_criado", "clientes", data?.id, { nome: parsed.data.nome });

    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo cliente">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="cliente-nome">Nome</Label>
          <Input id="cliente-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={200} />
        </div>
        <div>
          <Label htmlFor="cliente-telefone">Telefone</Label>
          <Input
            id="cliente-telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(71) 98888-7777"
            required
          />
        </div>
        <div>
          <Label htmlFor="cliente-origem">Canal</Label>
          <Select
            id="cliente-origem"
            value={origemChat}
            onChange={(e) => setOrigemChat(e.target.value as OrigemChat)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="cliente-observacoes">Observações (opcional)</Label>
          <Textarea
            id="cliente-observacoes"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Preferências, alergias, combinados..."
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
