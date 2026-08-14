"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Video, ImageOff } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { VitrineForm } from "./VitrineForm";
import type { VitrineItem } from "@/types/database";

export function VitrineSection({ itens }: { itens: VitrineItem[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VitrineItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: VitrineItem) {
    setEditing(item);
    setFormOpen(true);
  }

  async function avisarSite() {
    try {
      await fetch("/api/vitrine/revalidar", { method: "POST" });
    } catch {
      // best-effort
    }
  }

  async function toggleAtivo(item: VitrineItem) {
    setPendingId(item.id);
    const supabase = createClient();
    await supabase.from("vitrine_itens").update({ ativo: !item.ativo }).eq("id", item.id);
    await logAudit(supabase, "vitrine_item_atualizado", "vitrine_itens", item.id, { ativo: !item.ativo });
    await avisarSite();
    router.refresh();
    setPendingId(null);
  }

  async function handleDelete(item: VitrineItem) {
    if (!confirm(`Remover "${item.titulo}" da vitrine?`)) return;
    setPendingId(item.id);
    const supabase = createClient();
    await supabase.from("vitrine_itens").delete().eq("id", item.id);
    await logAudit(supabase, "vitrine_item_excluido", "vitrine_itens", item.id, { titulo: item.titulo });
    await avisarSite();
    router.refresh();
    setPendingId(null);
  }

  async function mover(item: VitrineItem, direcao: -1 | 1) {
    const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem);
    const index = ordenados.findIndex((i) => i.id === item.id);
    const vizinho = ordenados[index + direcao];
    if (!vizinho) return;

    setPendingId(item.id);
    const supabase = createClient();
    await Promise.all([
      supabase.from("vitrine_itens").update({ ordem: vizinho.ordem }).eq("id", item.id),
      supabase.from("vitrine_itens").update({ ordem: item.ordem }).eq("id", vizinho.id),
    ]);
    await avisarSite();
    router.refresh();
    setPendingId(null);
  }

  const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem);
  const proximaOrdem = itens.length === 0 ? 0 : Math.max(...itens.map((i) => i.ordem)) + 1;

  return (
    <Card>
      <CardHeader
        title="Vitrine do site"
        description="Promoções e produtos em destaque exibidos em farmaciaprecobom.com.br. Mudanças aparecem no site em poucos segundos."
        action={
          <Button size="sm" onClick={openNew}>
            <Plus size={15} /> Novo item
          </Button>
        }
      />

      {ordenados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
          Nenhum item na vitrine ainda — o site mostra uma lista padrão até você adicionar o primeiro.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordenados.map((item, index) => (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5"
            >
              <div className="relative h-32 bg-gray-100 dark:bg-white/5">
                {item.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem vem de URL do Storage
                  <img src={item.imagem_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600">
                    <ImageOff size={28} />
                  </div>
                )}
                {item.video_url && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                    <Video size={11} /> Vídeo
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {item.tag && (
                      <span className="mb-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-red-600 dark:bg-red-500/10 dark:text-red-400">
                        {item.tag}
                      </span>
                    )}
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.titulo}</p>
                  </div>
                  <button onClick={() => toggleAtivo(item)} disabled={pendingId === item.id} className="shrink-0 disabled:opacity-50">
                    <Badge variant={item.ativo ? "green" : "gray"}>{item.ativo ? "Visível" : "Oculto"}</Badge>
                  </button>
                </div>
                <p className="font-display text-lg font-bold text-brand-600 dark:text-brand-400">{formatCurrency(item.preco)}</p>

                <div className="mt-auto flex items-center justify-between pt-1">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => mover(item, -1)}
                      disabled={pendingId === item.id || index === 0}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-30 dark:hover:bg-white/10"
                      aria-label="Mover pra cima"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => mover(item, 1)}
                      disabled={pendingId === item.id || index === ordenados.length - 1}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-30 dark:hover:bg-white/10"
                      aria-label="Mover pra baixo"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => openEdit(item)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-white/10"
                      aria-label="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={pendingId === item.id}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
                      aria-label="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <VitrineForm open={formOpen} onClose={() => setFormOpen(false)} item={editing} proximaOrdem={proximaOrdem} />
    </Card>
  );
}
