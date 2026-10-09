"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FileText, ImageOff, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import type { MensagemComUsuario } from "@/types/relations";

// Foto, áudio ou PDF que o cliente mandou pelo WhatsApp. Sem midia_url (link
// assinado ainda não gerado, ou arquivo não baixou — ver src/lib/chat-midia.ts)
// não mostra nada, e a legenda/transcrição em `conteudo` aparece como reserva
// (essa decisão fica no MessageThread).

// Cores do player/botões por bolha. O Tailwind 3 não aceita `bg-current/25`,
// então cada remetente tem suas classes explícitas: a IA é clara (violeta) e
// as outras bolhas têm fundo forte com texto branco.
const COR_CONTROLE = {
  ia: "bg-violet-600/15 text-violet-800 hover:bg-violet-600/25 dark:bg-white/15 dark:text-violet-100 dark:hover:bg-white/25",
  cliente: "bg-white/25 text-white hover:bg-white/35",
  funcionaria: "bg-white/25 text-white hover:bg-white/35",
} as const;

const COR_FUNDO_MIDIA = {
  ia: "bg-violet-600/10 dark:bg-white/10",
  cliente: "bg-black/15",
  funcionaria: "bg-black/15",
} as const;

// Só um áudio toca por vez: guardamos qual está tocando e pausamos ele quando
// outro começa.
let audioTocando: HTMLAudioElement | null = null;

// Força o navegador a baixar o arquivo (o atributo `download` do <a> é ignorado
// em links de outro domínio, como o do Storage). O Supabase aceita ?download=nome.
function urlParaBaixar(url: string, nome: string) {
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(nome)}`;
}

function formatarTempo(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const min = Math.floor(segundos / 60);
  const seg = Math.floor(segundos % 60);
  return `${min}:${seg.toString().padStart(2, "0")}`;
}

/**
 * Controla a falha de carregamento da mídia. Os links assinados expiram em 6h:
 * na primeira falha pedimos links novos UMA vez (router.refresh) e só depois
 * mostramos o erro. O ref impede que isso vire um loop.
 */
function useFalhaDeMidia(url: string) {
  const router = useRouter();
  const jaRenovou = useRef(false);
  const renovandoRef = useRef(false);
  const [renovando, setRenovando] = useState(false);
  const [erro, setErro] = useState(false);

  // Link novo chegou (ou o primeiro): recomeça limpo.
  useEffect(() => {
    renovandoRef.current = false;
    setRenovando(false);
    setErro(false);
  }, [url]);

  // Se o refresh não trouxer link diferente, não fica rodando pra sempre.
  useEffect(() => {
    if (!renovando) return;
    const t = setTimeout(() => {
      renovandoRef.current = false;
      setRenovando(false);
      setErro(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [renovando]);

  const aoFalhar = useCallback(() => {
    if (renovandoRef.current) return; // onError + checagem do useEffect podem chegar juntos
    if (!jaRenovou.current) {
      jaRenovou.current = true;
      renovandoRef.current = true;
      setRenovando(true);
      router.refresh();
      return;
    }
    setErro(true);
  }, [router]);

  return { erro, renovando, aoFalhar };
}

function VisualizadorImagem({ url, nome, onClose }: { url: string; nome: string; onClose: () => void }) {
  useEffect(() => {
    const aoApertar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoApertar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // trava a rolagem da página por trás
    return () => {
      document.removeEventListener("keydown", aoApertar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [onClose]);

  const botao =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Imagem ampliada"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <div className="absolute right-4 top-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={urlParaBaixar(url, nome)} title="Baixar" aria-label="Baixar imagem" className={botao}>
          <Download size={18} />
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir em outra aba"
          aria-label="Abrir imagem em outra aba"
          className={botao}
        >
          <ExternalLink size={18} />
        </a>
        <button type="button" onClick={onClose} title="Fechar" aria-label="Fechar" className={botao}>
          <X size={20} />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={nome}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body
  );
}

function MidiaImagem({ msg, url }: { msg: MensagemComUsuario; url: string }) {
  const nome = msg.midia_nome ?? "Imagem enviada pelo cliente";
  const imgRef = useRef<HTMLImageElement>(null);
  const [carregando, setCarregando] = useState(true);
  const [ampliada, setAmpliada] = useState(false);
  const { erro, aoFalhar } = useFalhaDeMidia(url);
  const fechar = useCallback(() => setAmpliada(false), []);

  // A página é renderizada no servidor: a imagem pode terminar de carregar
  // antes da hidratação e aí o onLoad nunca dispara. Por isso conferimos o
  // estado real do <img> aqui também.
  useEffect(() => {
    setCarregando(true);
    const img = imgRef.current;
    if (img?.complete) {
      if (img.naturalWidth > 0) setCarregando(false);
      else aoFalhar();
    }
  }, [url, aoFalhar]);

  if (erro) {
    return (
      <div className={cn("mb-1.5 flex h-28 w-56 flex-col items-center justify-center gap-1.5 rounded-lg px-3 text-center", COR_FUNDO_MIDIA[msg.remetente])}>
        <ImageOff size={22} className="opacity-80" />
        <p className="text-xs opacity-90">Não foi possível carregar a foto.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium underline underline-offset-2">
          Tentar abrir em outra aba
        </a>
      </div>
    );
  }

  return (
    <div className={cn("relative mb-1.5", carregando && "h-40 w-56")}>
      {carregando && (
        <div className={cn("absolute inset-0 flex items-center justify-center rounded-lg", COR_FUNDO_MIDIA[msg.remetente])}>
          <Spinner size={28} className={msg.remetente === "ia" ? "text-violet-600 dark:text-violet-200" : "text-white"} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setAmpliada(true)}
        title="Ampliar"
        className={cn("block cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white", carregando && "opacity-0")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt={nome}
          onLoad={() => setCarregando(false)}
          onError={aoFalhar}
          className="max-h-64 w-auto max-w-full rounded-lg object-cover"
        />
      </button>
      {ampliada && <VisualizadorImagem url={url} nome={nome} onClose={fechar} />}
    </div>
  );
}

const VELOCIDADES = [1, 1.5, 2] as const;

function MidiaAudio({ msg, url }: { msg: MensagemComUsuario; url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [carregando, setCarregando] = useState(true);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState<(typeof VELOCIDADES)[number]>(1);
  const [naoToca, setNaoToca] = useState(false);
  const { erro, aoFalhar } = useFalhaDeMidia(url);

  const lerMetadados = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Number.isFinite(audio.duration)) setDuracao(audio.duration);
    setCarregando(false);
  }, []);

  // Mesmo problema da foto: o áudio pode ter carregado os metadados antes da
  // hidratação. readyState >= 1 (HAVE_METADATA) significa que já está pronto.
  useEffect(() => {
    setCarregando(true);
    setTocando(false);
    setAtual(0);
    setNaoToca(false);
    const audio = audioRef.current;
    if (audio && audio.readyState >= 1) lerMetadados();
    else if (audio?.error) aoFalhar();
  }, [url, lerMetadados, aoFalhar]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = velocidade;
  }, [velocidade]);

  // Ao sair da tela, não deixa o áudio tocando nem registrado como "o atual".
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && audioTocando === audio) audioTocando = null;
    };
  }, []);

  async function alternarTocar() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      audio.playbackRate = velocidade;
      await audio.play();
    } catch {
      setNaoToca(true);
    }
  }

  function aoComecar() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioTocando && audioTocando !== audio) audioTocando.pause();
    audioTocando = audio;
    setTocando(true);
  }

  function aoParar() {
    if (audioTocando === audioRef.current) audioTocando = null;
    setTocando(false);
  }

  function buscar(valor: number) {
    if (audioRef.current) audioRef.current.currentTime = valor;
    setAtual(valor);
  }

  function proximaVelocidade() {
    setVelocidade((v) => VELOCIDADES[(VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length]);
  }

  const cor = COR_CONTROLE[msg.remetente];
  const linkBaixar = (
    <a
      href={urlParaBaixar(url, msg.midia_nome ?? "audio")}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition", cor)}
    >
      <Download size={13} />
      Baixar
    </a>
  );

  if (erro || naoToca) {
    return (
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-xs opacity-90">{erro ? "Não foi possível carregar o áudio." : "Não foi possível tocar o áudio aqui."}</p>
        {linkBaixar}
      </div>
    );
  }

  const podeBuscar = duracao > 0;

  return (
    <div className={cn("mb-1.5 flex w-64 max-w-full items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3", COR_FUNDO_MIDIA[msg.remetente])}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={lerMetadados}
        onCanPlay={lerMetadados}
        onDurationChange={lerMetadados}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onPlay={aoComecar}
        onPause={aoParar}
        onEnded={() => {
          aoParar();
          setAtual(0);
        }}
        onError={aoFalhar}
        className="hidden"
      />
      <button
        type="button"
        onClick={alternarTocar}
        disabled={carregando}
        title={tocando ? "Pausar" : "Tocar"}
        aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60", cor)}
      >
        {carregando ? <Spinner size={16} className="text-current" /> : tocando ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={podeBuscar ? duracao : 1}
          step={0.1}
          value={podeBuscar ? Math.min(atual, duracao) : 0}
          disabled={!podeBuscar}
          onChange={(e) => buscar(Number(e.target.value))}
          aria-label="Posição do áudio"
          style={{ accentColor: "currentColor" }}
          className="block h-1 w-full cursor-pointer"
        />
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums opacity-80">
          <span>{formatarTempo(atual)}</span>
          <span>{podeBuscar ? formatarTempo(duracao) : "--:--"}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={proximaVelocidade}
        title="Velocidade de reprodução"
        aria-label={`Velocidade ${velocidade}x`}
        className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums transition", cor)}
      >
        {String(velocidade).replace(".", ",")}x
      </button>
    </div>
  );
}

export function MensagemMidia({ msg }: { msg: MensagemComUsuario }) {
  if (!msg.midia_url) return null;

  if (msg.tipo === "imagem") return <MidiaImagem msg={msg} url={msg.midia_url} />;
  if (msg.tipo === "audio") return <MidiaAudio msg={msg} url={msg.midia_url} />;

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
