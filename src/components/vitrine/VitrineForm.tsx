"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Video, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { vitrineItemCreateSchema } from "@/lib/validation";
import type { VitrineItem } from "@/types/database";

export function VitrineForm({
  open,
  onClose,
  item,
  proximaOrdem,
}: {
  open: boolean;
  onClose: () => void;
  item: VitrineItem | null;
  proximaOrdem: number;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tag, setTag] = useState("");
  const [preco, setPreco] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState<"imagem" | "video" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imagemInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setTitulo(item?.titulo ?? "");
      setDescricao(item?.descricao ?? "");
      setTag(item?.tag ?? "");
      setPreco(item ? String(item.preco) : "");
      setAtivo(item?.ativo ?? true);
      setImagemUrl(item?.imagem_url ?? null);
      setVideoUrl(item?.video_url ?? null);
      setError(null);
    }
  }, [open, item]);

  async function avisarSite() {
    try {
      await fetch("/api/vitrine/revalidar", { method: "POST" });
    } catch {
      // best-effort — não impede o resto do fluxo
    }
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>, tipo: "imagem" | "video") {
    const file = e.target.files?.[0];
    if (!file) return;

    setEnviandoArquivo(tipo);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/vitrine/upload", { method: "POST", body: formData });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Não foi possível enviar o arquivo.");
        return;
      }
      if (tipo === "imagem") setImagemUrl(body.url);
      else setVideoUrl(body.url);
    } catch {
      setError("Erro de conexão ao enviar o arquivo.");
    } finally {
      setEnviandoArquivo(null);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = vitrineItemCreateSchema.safeParse({
      titulo,
      descricao: descricao.trim() || null,
      tag: tag.trim() || null,
      preco: Number(preco.replace(",", ".")),
      imagem_url: imagemUrl,
      video_url: videoUrl,
      ordem: item?.ordem ?? proximaOrdem,
      ativo,
    });

    if (!parsed.success) {
      setError("Preencha pelo menos o título e um preço válido.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = item
      ? await supabase.from("vitrine_itens").update(parsed.data).eq("id", item.id).select("id").single()
      : await supabase.from("vitrine_itens").insert(parsed.data).select("id").single();
    setSaving(false);

    if (dbError) {
      setError("Não foi possível salvar.");
      return;
    }

    await logAudit(supabase, item ? "vitrine_item_atualizado" : "vitrine_item_criado", "vitrine_itens", data?.id, {
      titulo: parsed.data.titulo,
    });
    await avisarSite();

    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? "Editar item da vitrine" : "Novo item da vitrine"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
        </div>
        <div>
          <Label htmlFor="descricao">Descrição (opcional)</Label>
          <Textarea
            id="descricao"
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={1000}
            placeholder='Ex.: "Efeito 7 em 1 — 20 comprimidos"'
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tag">Selo (opcional)</Label>
            <Input id="tag" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} placeholder="Ex.: Gripe" />
          </div>
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="imagem">Foto</Label>
            <input
              ref={imagemInputRef}
              id="imagem"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleArquivo(e, "imagem")}
            />
            {imagemUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- preview de URL do Storage, sem domínio fixo pra configurar */}
                <img src={imagemUrl} alt="" className="h-24 w-full rounded-lg border border-gray-200 object-cover dark:border-white/10" />
                <button
                  type="button"
                  onClick={() => setImagemUrl(null)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={enviandoArquivo === "imagem"}
                onClick={() => imagemInputRef.current?.click()}
              >
                <Upload size={14} /> {enviandoArquivo === "imagem" ? "Enviando..." : "Enviar foto"}
              </Button>
            )}
          </div>
          <div>
            <Label htmlFor="video">Vídeo (opcional)</Label>
            <input
              ref={videoInputRef}
              id="video"
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              onChange={(e) => handleArquivo(e, "video")}
            />
            {videoUrl ? (
              <div className="flex h-24 items-center justify-between rounded-lg border border-gray-200 px-3 text-sm text-gray-600 dark:border-white/10 dark:text-gray-300">
                <span className="flex items-center gap-1.5 truncate">
                  <Video size={14} className="shrink-0" /> Vídeo enviado
                </span>
                <button type="button" onClick={() => setVideoUrl(null)} className="shrink-0 text-gray-400 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={enviandoArquivo === "video"}
                onClick={() => videoInputRef.current?.click()}
              >
                <Video size={14} /> {enviandoArquivo === "video" ? "Enviando..." : "Enviar vídeo"}
              </Button>
            )}
          </div>
        </div>
        <p className="-mt-2 text-xs text-gray-400">Foto até 5MB (JPEG/PNG/WEBP). Vídeo até 25MB (MP4/WEBM).</p>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Visível no site agora
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || enviandoArquivo !== null}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
