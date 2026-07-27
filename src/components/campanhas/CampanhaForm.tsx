"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { campanhaCreateSchema } from "@/lib/validation";
import type { ClientesAlvo, OrigemChat } from "@/types/database";

export function CampanhaForm({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [clientesAlvo, setClientesAlvo] = useState<ClientesAlvo>("todos");
  const [origemFiltro, setOrigemFiltro] = useState<OrigemChat>("whatsapp");
  const [agendadaPara, setAgendadaPara] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function reset() {
    setTitulo("");
    setMensagem("");
    setClientesAlvo("todos");
    setAgendadaPara("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = campanhaCreateSchema.safeParse({
      titulo,
      mensagem,
      clientes_alvo: clientesAlvo,
      filtro_json: clientesAlvo === "por_filtro" ? { origem_chat: origemFiltro } : null,
      agendada_para: agendadaPara ? new Date(agendadaPara).toISOString() : null,
    });

    if (!parsed.success) {
      setError("Preencha título e mensagem corretamente.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("campanhas")
      .insert({
        titulo: parsed.data.titulo,
        mensagem: parsed.data.mensagem,
        clientes_alvo: parsed.data.clientes_alvo,
        filtro_json: parsed.data.filtro_json ?? null,
        agendada_para: parsed.data.agendada_para,
        status: parsed.data.agendada_para ? "agendada" : "rascunho",
        criado_por: userId,
      })
      .select("id")
      .single();
    setSaving(false);

    if (dbError) {
      setError("Não foi possível criar a campanha.");
      return;
    }

    await logAudit(supabase, "campanha_criada", "campanhas", data?.id, { titulo: parsed.data.titulo });

    reset();
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova campanha">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
        </div>

        <div>
          <Label htmlFor="mensagem">Mensagem</Label>
          <Textarea
            id="mensagem"
            rows={4}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            required
            maxLength={2000}
          />
        </div>

        <div>
          <Label>Público</Label>
          <div className="flex gap-2">
            <Select value={clientesAlvo} onChange={(e) => setClientesAlvo(e.target.value as ClientesAlvo)}>
              <option value="todos">Todos os clientes</option>
              <option value="por_filtro">Filtrar por origem</option>
            </Select>
            {clientesAlvo === "por_filtro" && (
              <Select value={origemFiltro} onChange={(e) => setOrigemFiltro(e.target.value as OrigemChat)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
              </Select>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="agendada_para">Agendar envio (opcional)</Label>
          <Input
            id="agendada_para"
            type="datetime-local"
            value={agendadaPara}
            onChange={(e) => setAgendadaPara(e.target.value)}
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Criar campanha"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
