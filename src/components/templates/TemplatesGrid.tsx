"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { TemplateForm } from "./TemplateForm";
import type { TemplateMensagem, TemplateCategoria } from "@/types/database";

const CATEGORIAS: { key: TemplateCategoria; label: string; variant: "green" | "purple" | "blue" | "gray" }[] = [
  { key: "confirmacao", label: "Confirmação", variant: "green" },
  { key: "promocao", label: "Promoção", variant: "purple" },
  { key: "duvida", label: "Dúvida", variant: "blue" },
  { key: "outro", label: "Outro", variant: "gray" },
];

export function TemplatesGrid({ templates, isDona }: { templates: TemplateMensagem[]; isDona: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateMensagem | null>(null);
  const router = useRouter();

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(t: TemplateMensagem) {
    setEditing(t);
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este template?")) return;
    const supabase = createClient();
    await supabase.from("templates_mensagem").delete().eq("id", id);
    await logAudit(supabase, "template_excluido", "templates_mensagem", id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Templates de mensagem"
          description="Respostas prontas organizadas por categoria."
          action={
            isDona && (
              <Button size="sm" onClick={openNew}>
                <Plus size={15} /> Novo template
              </Button>
            )
          }
        />
      </Card>

      {CATEGORIAS.map((cat) => {
        const items = templates.filter((t) => t.categoria === cat.key);
        if (items.length === 0) return null;
        return (
          <div key={cat.key} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Badge variant={cat.variant}>{cat.label}</Badge>
              <span className="text-xs text-gray-400 dark:text-gray-500">{items.length} template(s)</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => (
                <Card key={t.id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.titulo}</p>
                    {isDona && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => openEdit(t)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t.conteudo}</p>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {templates.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
          <FileText size={36} />
          <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum template cadastrado ainda.</p>
        </div>
      )}

      {isDona && <TemplateForm open={formOpen} onClose={() => setFormOpen(false)} template={editing} />}
    </div>
  );
}
