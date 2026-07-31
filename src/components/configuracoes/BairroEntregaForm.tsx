"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Label, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { bairroEntregaCreateSchema } from "@/lib/validation";
import type { BairroEntrega } from "@/types/database";

export function BairroEntregaForm({
  open,
  onClose,
  bairroEntrega,
}: {
  open: boolean;
  onClose: () => void;
  bairroEntrega: BairroEntrega | null;
}) {
  const [bairro, setBairro] = useState("");
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setBairro(bairroEntrega?.bairro ?? "");
      setValor(bairroEntrega ? String(bairroEntrega.valor) : "");
      setError(null);
    }
  }, [open, bairroEntrega]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = bairroEntregaCreateSchema.safeParse({
      bairro,
      valor: Number(valor.replace(",", ".")),
      ativo: bairroEntrega?.ativo ?? true,
    });

    if (!parsed.success) {
      setError("Preencha o bairro e um valor de entrega válido (número).");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = bairroEntrega
      ? await supabase.from("bairros_entrega").update(parsed.data).eq("id", bairroEntrega.id).select("id").single()
      : await supabase.from("bairros_entrega").insert(parsed.data).select("id").single();
    setSaving(false);

    if (dbError) {
      setError(dbError.code === "23505" ? "Já existe um bairro cadastrado com esse nome." : "Não foi possível salvar.");
      return;
    }

    await logAudit(supabase, bairroEntrega ? "bairro_entrega_atualizado" : "bairro_entrega_criado", "bairros_entrega", data?.id, {
      bairro: parsed.data.bairro,
    });

    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={bairroEntrega ? "Editar bairro" : "Novo bairro de entrega"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="bairro">Bairro</Label>
          <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} required maxLength={150} />
        </div>
        <div>
          <Label htmlFor="valor">Valor da entrega (R$)</Label>
          <Input
            id="valor"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            required
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
