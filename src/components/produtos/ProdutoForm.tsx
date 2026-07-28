"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Label, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { produtoCreateSchema } from "@/lib/validation";
import type { Produto } from "@/types/database";

export function ProdutoForm({
  open,
  onClose,
  produto,
}: {
  open: boolean;
  onClose: () => void;
  produto: Produto | null;
}) {
  const [nome, setNome] = useState("");
  const [laboratorio, setLaboratorio] = useState("");
  const [preco, setPreco] = useState("");
  const [estoque, setEstoque] = useState("");
  const [sku, setSku] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setNome(produto?.nome ?? "");
      setLaboratorio(produto?.laboratorio ?? "");
      setPreco(produto ? String(produto.preco) : "");
      setEstoque(produto ? String(produto.estoque) : "");
      setSku(produto?.sku ?? "");
      setError(null);
    }
  }, [open, produto]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = produtoCreateSchema.safeParse({
      nome,
      laboratorio: laboratorio || null,
      preco: Number(preco.replace(",", ".")),
      estoque: Number(estoque || 0),
      sku: sku || null,
    });

    if (!parsed.success) {
      setError("Preencha nome, preço (número) e estoque (número inteiro) corretamente.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = produto
      ? await supabase.from("produtos").update(parsed.data).eq("id", produto.id).select("id").single()
      : await supabase.from("produtos").insert(parsed.data).select("id").single();
    setSaving(false);

    if (dbError) {
      setError(
        dbError.code === "23505" ? "Já existe um produto com esse SKU." : "Não foi possível salvar o produto."
      );
      return;
    }

    await logAudit(supabase, produto ? "produto_atualizado" : "produto_criado", "produtos", data?.id, {
      nome: parsed.data.nome,
    });

    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={produto ? "Editar produto" : "Novo produto"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={300} />
        </div>
        <div>
          <Label htmlFor="laboratorio">Laboratório</Label>
          <Input id="laboratorio" value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} maxLength={200} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="preco">Preço (R$)</Label>
            <Input
              id="preco"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
              required
            />
          </div>
          <div>
            <Label htmlFor="estoque">Estoque</Label>
            <Input
              id="estoque"
              type="number"
              min={0}
              step={1}
              value={estoque}
              onChange={(e) => setEstoque(e.target.value)}
              placeholder="0"
              required
            />
          </div>
        </div>
        <div>
          <Label htmlFor="sku">SKU (opcional)</Label>
          <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={100} />
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
