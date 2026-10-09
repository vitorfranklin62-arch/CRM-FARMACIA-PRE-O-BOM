"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FileText, ImageOff, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import type { MensagemComUsuario } from "@/types/relations";

// Foto, áudio ou PDF que o cliente mandou pelo WhatsApp. Sem midia_url (link
// assinado ainda não gerado, ou arquivo não baixou — ver src/lib/chat-midia.ts)
// não mostra nada, e a legenda/transcrição em `conteudo` aparece como reserva.
export function temMidiaVisivel(msg: MensagemComUsuario) {
  return !!msg.midia_url && (msg.tipo === "imagem" || msg.tipo === "audio");
}

// O link assinado expira (6h). Se a aba ficou aberta tempo demais e a mídia
// falhou, recarrega os dados da conversa UMA vez pra gerar links novos — sem
// loop infinito caso o arquivo realmente não exista mais.
function useRenovarLinkUmaVez() {
  const router = useRouter();
  const jaTentou = useRef(false);
  return useCallback(() => {
    if (jaTentou.current) return false;
    jaTentou.current = true;
    router.refresh();
    return true;
  }, [router]);
}

function formatarTempo(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Imagem({ msg, url }: { msg: MensagemComUsuario; url: string }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const renovarLink = useRenovarLinkUmaVez();
  const alt = msg.midia_nome ?? "Imagem enviada pelo cliente";

  // Quando a página vem renderizada do servidor, a imagem pode terminar de
  // carregar ANTES do React hidratar — aí o onLoad nunca dispara e o spinner
  // ficaria pra sempre. Checar `complete` cobre esse caso.
  useEffect(() => {
    setErro(false);
    const img = imgRef.current;
    if (img?.complete) {
      if (img.naturalWidth > 0) setCarregando(false);
      else setErro(true);
    } else {
      setCarregando(true);
    }
  }, [url]);

  useEffect(() => {
    if (!ampliada) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAmpliada(false);
    document.addEventListener("keydown", aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [ampliada]);

  function aoFalhar() {
    // Primeira falha: provavelmente link vencido — pede links novos.
    if (renovarLink()) return;
    setErro(true);
    setCarregando(false);
  }

  if (erro) {
    return (
      <div className="mb-1.5 flex h-24 w-56 flex-col items-center justify-center gap-1 rounded-lg bg-black/10 text-xs dark:bg-white/10">
        <ImageOff size={20} className="opacity-70" />
        Não foi possível carregar a foto.
      </div>
    );
  }

  return (
    <>
      <div className="relative mb-1.5">
        {carregando && (
          <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-black/10 dark:bg-white/10">
            <Spinner size={28} className="text-white" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setAmpliada(true)}
          title="Ampliar foto"
          className={cn("block cursor-zoom-in", carregando && "hidden")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={url}
            alt={alt}
            onLoad={() => setCarregando(false)}
            onError={aoFalhar}
            className="max-h-64 w-auto max-w-full rounded-lg object-cover"
          />
        </button>
      </div>

      {ampliada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setAmpliada(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="absolute right-4 top-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <a
              href={url}
              download={msg.midia_nome ?? "foto"}
              title="Baixar foto"
              className="rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25"
            >
              <Download size={18} />
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir em outra aba"
              className="rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25"
            >
              <ExternalLink size={18} />
            </a>
            <button
              type="button"
              onClick={() => setAmpliada(false)}
              title="Fechar (Esc)"
              className="rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25"
            >
              <X size={18} />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

const VELOCIDADES = [1, 1.5, 2] as const;

function Audio({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState<(typeof VELOCIDADES)[number]>(1);
  const renovarLink = useRenovarLinkUmaVez();

  // Mesmo cuidado da imagem: se os metadados já chegaram antes da hidratação,
  // o evento não é reemitido — lê o estado atual do elemento.
  useEffect(() => {
    setErro(false);
    const el = audioRef.current;
    if (el && el.readyState >= 1) {
      setDuracao(Number.isFinite(el.duration) ? el.duration : 0);
      setCarregando(false);
    } else {
      setCarregando(true);
    }
  }, [url]);

  function alternar() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      // Só um áudio por vez: pausa qualquer outro que esteja tocando no chat.
      document.querySelectorAll("audio").forEach((outro) => {
        if (outro !== el) outro.pause();
      });
      el.play().catch(() => setErro(true));
    } else {
      el.pause();
    }
  }

  function trocarVelocidade() {
    const proxima = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length];
    setVelocidade(proxima);
    if (audioRef.current) audioRef.current.playbackRate = proxima;
  }

  function aoFalhar() {
    if (renovarLink()) return;
    setErro(true);
    setCarregando(false);
  }

  if (erro) {
    return (
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className="opacity-80">Não foi possível tocar o áudio aqui.</span>
        <a href={url} download className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
          <Download size={13} /> Baixar
        </a>
      </div>
    );
  }

  const progresso = duracao > 0 ? Math.min(atual / duracao, 1) : 0;

  return (
    <div className="mb-1.5 flex w-64 max-w-full items-center gap-2.5">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuracao(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);
          setCarregando(false);
        }}
        onCanPlay={() => setCarregando(false)}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setAtual(0);
        }}
        onError={aoFalhar}
      />
      <button
        type="button"
        onClick={alternar}
        disabled={carregando}
        title={tocando ? "Pausar" : "Ouvir áudio"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/15 transition hover:bg-black/25 disabled:opacity-60 dark:bg-white/15 dark:hover:bg-white/25"
      >
        {carregando ? (
          <Spinner size={16} className="text-current" />
        ) : tocando ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" className="translate-x-px" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={duracao || 1}
          step={0.1}
          value={atual}
          disabled={carregando || duracao === 0}
          aria-label="Posição do áudio"
          onChange={(e) => {
            const valor = Number(e.target.value);
            setAtual(valor);
            if (audioRef.current) audioRef.current.currentTime = valor;
          }}
          style={{ backgroundSize: `${progresso * 100}% 100%` }}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-black/20 bg-gradient-to-r from-current to-current bg-no-repeat accent-current disabled:cursor-default dark:bg-white/25"
        />
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums opacity-70">
          <span>{formatarTempo(atual)}</span>
          <span>{formatarTempo(duracao)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={trocarVelocidade}
        title="Velocidade de reprodução"
        className="w-9 shrink-0 rounded-full bg-black/15 py-1 text-[11px] font-semibold tabular-nums transition hover:bg-black/25 dark:bg-white/15 dark:hover:bg-white/25"
      >
        {velocidade}x
      </button>
    </div>
  );
}

export function MensagemMidia({ msg }: { msg: MensagemComUsuario }) {
  if (!msg.midia_url) return null;

  if (msg.tipo === "imagem") return <Imagem msg={msg} url={msg.midia_url} />;
  if (msg.tipo === "audio") return <Audio url={msg.midia_url} />;

  if (msg.tipo === "documento") {
    return (
      <a
        href={msg.midia_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-sm font-medium underline-offset-2 hover:underline dark:bg-white/10"
      >
        <FileText size={16} className="shrink-0" />
        <span className="truncate">{msg.midia_nome ?? "Documento PDF"}</span>
      </a>
    );
  }

  return null;
}
