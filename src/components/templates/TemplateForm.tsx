"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { templateCreateSchema } from "@/lib/validation";
import type { TemplateCategoria, TemplateMensagem } from "@/types/database";

export function TemplateForm({
  open,
  onClose,
  template,
}: {
  open: boolean;
  onClose: () => void;
  template: TemplateMensagem | null;
}) {
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [categoria, setCategoria] = useState<TemplateCategoria>("outro");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setTitulo(template?.titulo ?? "");
      setConteudo(template?.conteudo ?? "");
      setCategoria(template?.categoria ?? "outro");
      setError(null);
    }
  }, [open, template]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = templateCreateSchema.safeParse({ titulo, conteudo, categoria });
    if (!parsed.success) {
      setError("Preencha título e conteúdo.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = template
      ? await supabase.from("templates_mensagem").update(parsed.data).eq("id", template.id).select("id").single()
      : await supabase.from("templates_mensagem").insert(parsed.data).select("id").single();
    setSaving(false);

    if (dbError) {
      setError("Não foi possível salvar o template.");
      return;
    }

    await logAudit(supabase, template ? "template_atualizado" : "template_criado", "templates_mensagem", data?.id, {
      titulo: parsed.data.titulo,
    });

    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={template ? "Editar template" : "Novo template"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
        </div>
        <div>
          <Label htmlFor="categoria">Categoria</Label>
          <Select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as TemplateCategoria)}>
            <option value="confirmacao">Confirmação</option>
            <option value="promocao">Promoção</option>
            <option value="duvida">Dúvida</option>
            <option value="outro">Outro</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="conteudo">Conteúdo</Label>
          <Textarea
            id="conteudo"
            rows={4}
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            required
            maxLength={2000}
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
