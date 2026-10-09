"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

const LIMITE_SEGUNDOS = 5 * 60;

// Ordem de preferência: ogg/opus é o que o WhatsApp usa por dentro (Firefox);
// o Chrome/Edge gravam webm/opus e o Safari mp4.
const FORMATOS_PREFERIDOS = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function formatarTempo(segundos: number) {
  return `${Math.floor(segundos / 60)}:${(segundos % 60).toString().padStart(2, "0")}`;
}

function mensagemDeErroDoMicrofone(erro: unknown) {
  const nome = erro instanceof DOMException ? erro.name : "";
  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return "Microfone bloqueado. Permita o acesso ao microfone no navegador e tente de novo.";
  }
  if (nome === "NotFoundError") return "Nenhum microfone encontrado neste computador.";
  return "Não foi possível acessar o microfone.";
}

/**
 * Botão de gravar áudio do Chat ao vivo, no estilo do WhatsApp: toca no
 * microfone, grava, e escolhe entre descartar ou enviar. O envio vai pra
 * /api/chat/enviar-audio, que guarda o arquivo e manda pelo N8N.
 */
export function GravadorAudio({
  conversaId,
  onEnviado,
  onGravandoChange,
}: {
  conversaId: string;
  onEnviado: () => void;
  onGravandoChange: (gravando: boolean) => void;
}) {
  const [gravando, setGravando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const enviarAoParar = useRef(false);
  const onEnviadoRef = useRef(onEnviado);
  onEnviadoRef.current = onEnviado;

  function soltarMicrofone() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Contador do tempo gravado; ao chegar no limite, para e envia.
  useEffect(() => {
    if (!gravando) return;
    const inicio = Date.now();
    const timer = setInterval(() => {
      const decorrido = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(decorrido);
      if (decorrido >= LIMITE_SEGUNDOS) parar(true);
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravando]);

  // Saiu da conversa no meio da gravação: descarta e solta o microfone.
  useEffect(() => {
    return () => {
      enviarAoParar.current = false;
      if (gravadorRef.current?.state === "recording") gravadorRef.current.stop();
      soltarMicrofone();
    };
  }, []);

  async function enviar(blob: Blob) {
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("conversa_id", conversaId);
      form.append("audio", blob, "audio");
      const res = await fetch("/api/chat/enviar-audio", { method: "POST", body: form });
      const corpo = (await res.json().catch(() => null)) as { error?: string; entregue?: boolean } | null;
      if (!res.ok) {
        setAviso(corpo?.error ?? "Não foi possível enviar o áudio.");
      } else {
        if (corpo?.entregue === false) {
          setAviso("O áudio foi salvo no painel, mas não foi entregue ao WhatsApp. Confira o N8N e tente de novo.");
        }
        onEnviadoRef.current();
      }
    } catch {
      setAviso("Sem conexão: não foi possível enviar o áudio.");
    } finally {
      setEnviando(false);
      onGravandoChange(false);
    }
  }

  async function comecar() {
    if (gravando || enviando) return;
    setAviso(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setAviso("Este navegador não permite gravar áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const formato = FORMATOS_PREFERIDOS.find((f) => MediaRecorder.isTypeSupported(f));
      const gravador = new MediaRecorder(stream, formato ? { mimeType: formato } : undefined);
      pedacosRef.current = [];
      enviarAoParar.current = false;
      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data);
      };
      gravador.onstop = () => {
        const deveEnviar = enviarAoParar.current;
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || formato || "audio/webm" });
        pedacosRef.current = [];
        soltarMicrofone();
        setGravando(false);
        // Enquanto envia, a barra "Enviando..." continua no lugar do campo de texto.
        if (deveEnviar && blob.size > 0) void enviar(blob);
        else onGravandoChange(false);
      };
      gravadorRef.current = gravador;
      gravador.start();
      setSegundos(0);
      setGravando(true);
      onGravandoChange(true);
    } catch (erro) {
      soltarMicrofone();
      setAviso(mensagemDeErroDoMicrofone(erro));
    }
  }

  function parar(enviarAgora: boolean) {
    const gravador = gravadorRef.current;
    if (!gravador || gravador.state !== "recording") return;
    // Gravação curtinha demais (toque sem querer) não vale a pena enviar.
    enviarAoParar.current = enviarAgora && segundos >= 1;
    gravador.stop();
  }

  const caixaAviso = aviso && (
    <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">
      {aviso}
    </p>
  );

  if (gravando || enviando) {
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        {caixaAviso}
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-400/30 dark:bg-red-500/10">
          {enviando ? (
            <>
              <Spinner size={18} />
              <span className="text-sm text-gray-700 dark:text-gray-200">Enviando áudio...</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium tabular-nums text-red-700 dark:text-red-300">{formatarTempo(segundos)}</span>
              <span className="flex-1 truncate text-xs text-red-600/80 dark:text-red-300/70">Gravando...</span>
              <button
                type="button"
                onClick={() => parar(false)}
                title="Descartar gravação"
                aria-label="Descartar gravação"
                className="rounded-lg p-2 text-red-600 transition hover:bg-red-100 dark:text-red-300 dark:hover:bg-white/10"
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                onClick={() => parar(true)}
                title="Enviar áudio"
                aria-label="Enviar áudio"
                className="rounded-lg bg-gradiente-acento p-2 text-white shadow-brilho-acento transition hover:brightness-110"
              >
                <Send size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {aviso && <div className="absolute inset-x-3 bottom-full mb-1">{caixaAviso}</div>}
      <button
        type="button"
        onClick={comecar}
        title="Gravar áudio"
        aria-label="Gravar áudio"
        className="rounded-xl p-2.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-white/10"
      >
        <Mic size={18} />
      </button>
    </>
  );
}
