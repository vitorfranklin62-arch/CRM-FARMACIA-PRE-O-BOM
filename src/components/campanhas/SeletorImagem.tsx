"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type MidiaCampanha = {
  midia_path: string;
  midia_mime: "image/jpeg" | "image/png";
  midia_tamanho: number;
  /** Link local (blob:) só pra mostrar na tela. */
  previaUrl: string;
};

const LIMITE_BYTES = 5 * 1024 * 1024;
/** Foto de celular costuma vir com 8–15 MB; acima disso nem tenta comprimir. */
const LIMITE_ORIGINAL_BYTES = 25 * 1024 * 1024;
const ACEITOS = ["image/jpeg", "image/png", "image/webp"];

function canvasParaJpeg(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualidade));
}

/**
 * Deixa a imagem no formato que a uazapi prefere ("JPG preferencialmente",
 * docs v2.6.9): JPG de até 5 MB passa direto; PNG, WEBP e fotos grandes viram
 * JPG (fundo branco no lugar da transparência, lado maior até 2560 px).
 */
async function prepararImagem(arquivo: File): Promise<File> {
  if (arquivo.type === "image/jpeg" && arquivo.size <= LIMITE_BYTES) return arquivo;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    // Navegador não conseguiu abrir (ex.: WEBP num navegador antigo). PNG pequeno ainda serve como está.
    if (arquivo.type === "image/png" && arquivo.size <= LIMITE_BYTES) return arquivo;
    throw new Error("Não consegui abrir essa imagem. Salve como JPG e tente de novo.");
  }

  for (const [ladoMax, qualidade] of [
    [2560, 0.88],
    [1920, 0.8],
    [1600, 0.72],
  ] as const) {
    const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasParaJpeg(canvas, qualidade);
    if (blob && blob.size <= LIMITE_BYTES) {
      return new File([blob], arquivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  throw new Error("A imagem continua acima de 5 MB mesmo comprimida. Use uma imagem menor.");
}

async function apagarNoServidor(caminho: string) {
  await fetch("/api/campanhas/midia", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ midia_path: caminho }),
  }).catch(() => {});
}

/**
 * "Adicionar imagem à campanha": clique ou arraste. A imagem sobe na hora
 * (pro botão "Enviar teste" já poder usar); trocar ou remover apaga o arquivo
 * anterior, então nada fica pendurado no armazenamento.
 */
export function SeletorImagem({
  campanhaId,
  midia,
  onChange,
  onEnviandoChange,
}: {
  campanhaId: string;
  midia: MidiaCampanha | null;
  onChange: (m: MidiaCampanha | null) => void;
  onEnviandoChange: (enviando: boolean) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Libera da memória a prévia local que saiu de uso.
  useEffect(() => {
    const url = midia?.previaUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [midia?.previaUrl]);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo || enviando) return;
    setErro(null);
    if (!ACEITOS.includes(arquivo.type)) {
      setErro("Formato não aceito. Use JPG, PNG ou WEBP.");
      return;
    }
    if (arquivo.size > LIMITE_ORIGINAL_BYTES) {
      setErro("Imagem grande demais (mais de 25 MB). Use uma imagem menor.");
      return;
    }

    setEnviando(true);
    onEnviandoChange(true);
    try {
      const pronta = await prepararImagem(arquivo);
      const form = new FormData();
      form.append("campanha_id", campanhaId);
      form.append("arquivo", pronta);
      const res = await fetch("/api/campanhas/midia", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Não foi possível enviar a imagem.");

      const anterior = midia?.midia_path;
      onChange({
        midia_path: json.midia_path,
        midia_mime: json.midia_mime,
        midia_tamanho: json.midia_tamanho,
        previaUrl: URL.createObjectURL(pronta),
      });
      if (anterior) void apagarNoServidor(anterior);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setEnviando(false);
      onEnviandoChange(false);
      if (input.current) input.current.value = "";
    }
  }

  function remover() {
    if (!midia) return;
    void apagarNoServidor(midia.midia_path);
    onChange(null);
    setErro(null);
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => escolher(e.target.files?.[0])}
      />

      {midia ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 p-2 dark:border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={midia.previaUrl} alt="Imagem selecionada" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1 text-xs text-gray-500 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-200">Imagem pronta</p>
            <p>
              {midia.midia_mime === "image/png" ? "PNG" : "JPG"} · {(midia.midia_tamanho / 1024).toFixed(0)} KB
            </p>
            <div className="mt-1.5 flex gap-3">
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={enviando}
                className="flex items-center gap-1 font-medium text-brand-600 hover:underline disabled:opacity-50"
              >
                {enviando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Trocar
              </button>
              <button
                type="button"
                onClick={remover}
                disabled={enviando}
                className="flex items-center gap-1 font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                <Trash2 size={12} /> Remover
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            void escolher(e.dataTransfer.files?.[0]);
          }}
          disabled={enviando}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-sm transition",
            arrastando
              ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
              : "border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:text-gray-400"
          )}
        >
          {enviando ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
          <span className="font-medium">{enviando ? "Enviando imagem..." : "Adicionar imagem à campanha (opcional)"}</span>
          <span className="text-xs text-gray-400">Clique ou arraste aqui · JPG, PNG ou WEBP · até 5 MB</span>
        </button>
      )}

      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
    </div>
  );
}
