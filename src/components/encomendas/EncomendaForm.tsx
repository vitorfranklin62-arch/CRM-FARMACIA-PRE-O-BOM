"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { encomendaCreateSchema } from "@/lib/validation";
import { normalizarTelefone } from "@/lib/telefone";

export function EncomendaForm({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [produtoNome, setProdutoNome] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setNome("");
      setTelefone("");
      setProdutoNome("");
      setQuantidade("1");
      setObservacoes("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = encomendaCreateSchema.safeParse({
      nome,
      telefone,
      produto_nome: produtoNome,
      quantidade: Number(quantidade),
      observacoes: observacoes || null,
    });

    if (!parsed.success) {
      setError("Preencha nome, telefone, produto e quantidade corretamente.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const telefoneNormalizado = normalizarTelefone(parsed.data.telefone);

    // Reaproveita o cliente se o telefone já existir, sem sobrescrever o nome
    // já cadastrado (evita que uma digitação rápida no balcão "renomeie" um
    // cliente antigo) — só cria um cliente novo quando o telefone é inédito.
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", telefoneNormalizado)
      .maybeSingle();

    let clienteId = existente?.id ?? null;

    if (!clienteId) {
      const { data: novoCliente, error: clienteError } = await supabase
        .from("clientes")
        .upsert({ telefone: telefoneNormalizado, nome: parsed.data.nome }, { onConflict: "telefone" })
        .select("id")
        .single();

      if (clienteError || !novoCliente) {
        setSaving(false);
        setError("Não foi possível registrar o cliente.");
        return;
      }
      clienteId = novoCliente.id;
    }

    const { data: encomenda, error: encomendaError } = await supabase
      .from("encomendas")
      .insert({
        cliente_id: clienteId,
        produto_nome: parsed.data.produto_nome,
        quantidade: parsed.data.quantidade,
        observacoes: parsed.data.observacoes ?? null,
        criado_por: userId,
      })
      .select("id")
      .single();

    setSaving(false);

    if (encomendaError || !encomenda) {
      setError("Não foi possível registrar a encomenda.");
      return;
    }

    await logAudit(supabase, "encomenda_criada", "encomendas", encomenda.id, { produto_nome: parsed.data.produto_nome });

    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova encomenda">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="encomenda-nome">Nome do cliente</Label>
            <Input id="encomenda-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={200} />
          </div>
          <div>
            <Label htmlFor="encomenda-telefone">Número</Label>
            <Input
              id="encomenda-telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(71) 98888-7777"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <Label htmlFor="encomenda-produto">Nome do produto</Label>
            <Input
              id="encomenda-produto"
              value={produtoNome}
              onChange={(e) => setProdutoNome(e.target.value)}
              placeholder="Ex.: Colírio Systane Ultra"
              required
              maxLength={300}
            />
          </div>
          <div>
            <Label htmlFor="encomenda-quantidade">Qtd.</Label>
            <Input
              id="encomenda-quantidade"
              type="number"
              min={1}
              max={9999}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="w-20"
              required
            />
          </div>
        </div>
        <div>
          <Label htmlFor="encomenda-observacoes">Observações (opcional)</Label>
          <Textarea
            id="encomenda-observacoes"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Prazo combinado, fornecedor, detalhes da embalagem..."
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

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
