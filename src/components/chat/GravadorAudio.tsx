"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, RotateCw, Send, Square, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { converterParaOggOpus } from "@/lib/audio-ogg-opus";

const LIMITE_SEGUNDOS = 5 * 60;
const MINIMO_SEGUNDOS = 1;
const LIMITE_BYTES = 16 * 1024 * 1024; // limite de áudio do WhatsApp

// Ordem de preferência do que o navegador grava. Antes de enviar, tudo é
// convertido para OGG/Opus (formato das mensagens de voz do WhatsApp); se o
// navegador não conseguir converter, vai o arquivo original.
const FORMATOS_PREFERIDOS = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

type Fase = "ocioso" | "gravando" | "processando" | "revisando" | "enviando" | "enviado";

function formatarTempo(segundos: number) {
  return `${Math.floor(segundos / 60)}:${(segundos % 60).toString().padStart(2, "0")}`;
}

function mensagemDeErroDoMicrofone(erro: unknown) {
  const nome = erro instanceof DOMException ? erro.name : "";
  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return "Microfone bloqueado. Permita o acesso ao microfone no navegador (ícone de cadeado na barra de endereço) e tente de novo.";
  }
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "Nenhum microfone encontrado neste aparelho.";
  if (nome === "NotReadableError") return "O microfone está sendo usado por outro programa. Feche-o e tente de novo.";
  return "Não foi possível acessar o microfone.";
}

/**
 * Gravador de áudio do Chat ao vivo. Fluxo: gravar → parar → (converte pra
 * OGG/Opus) → ouvir → enviar ou descartar. O envio vai pra
 * /api/chat/enviar-audio, que guarda o arquivo e manda pelo N8N/uazapi.
 */
export function GravadorAudio({
  conversaId,
  onEnviado,
  onOcupadoChange,
}: {
  conversaId: string;
  onEnviado: () => void;
  /** Avisa a tela quando o gravador está ocupando o lugar do campo de texto. */
  onOcupadoChange: (ocupado: boolean) => void;
}) {
  const [fase, setFase] = useState<Fase>("ocioso");
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const segundosRef = useRef(0);
  const finalRef = useRef<Blob | null>(null); // áudio pronto pra enviar (já convertido)
  const envioIdRef = useRef<string>("");
  const enviandoRef = useRef(false); // trava de clique duplo
  const montadoRef = useRef(true);
  const onEnviadoRef = useRef(onEnviado);
  onEnviadoRef.current = onEnviado;
  const onOcupadoRef = useRef(onOcupadoChange);
  onOcupadoRef.current = onOcupadoChange;

  const mudarFase = useCallback((nova: Fase) => {
    setFase(nova);
    onOcupadoRef.current(nova !== "ocioso");
  }, []);

  const soltarMicrofone = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const limparAudio = useCallback(() => {
    finalRef.current = null;
    setPreviewUrl((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
  }, []);

  // Contador do tempo gravado; no limite, para sozinho (e cai na revisão, sem enviar).
  useEffect(() => {
    if (fase !== "gravando") return;
    const inicio = Date.now();
    const timer = setInterval(() => {
      const decorrido = Math.floor((Date.now() - inicio) / 1000);
      segundosRef.current = decorrido;
      setSegundos(decorrido);
      if (decorrido >= LIMITE_SEGUNDOS) pararGravacao();
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  // Saiu da conversa no meio: solta o microfone e descarta tudo.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      const gravador = gravadorRef.current;
      if (gravador && gravador.state !== "inactive") {
        gravador.onstop = null;
        gravador.stop();
      }
      soltarMicrofone();
    };
  }, [soltarMicrofone]);

  // Libera a URL do preview ao desmontar.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function descartar() {
    const gravador = gravadorRef.current;
    if (gravador && gravador.state !== "inactive") {
      gravador.onstop = null;
      gravador.stop();
    }
    soltarMicrofone();
    pedacosRef.current = [];
    limparAudio();
    setErro(null);
    mudarFase("ocioso");
  }

  async function aoTerminarGravacao(tipo: string, interrompida: boolean) {
    soltarMicrofone();
    const original = new Blob(pedacosRef.current, { type: tipo });
    pedacosRef.current = [];

    if (original.size === 0) {
      setErro("A gravação saiu vazia. Verifique o microfone e tente de novo.");
      mudarFase("ocioso");
      return;
    }
    if (segundosRef.current < MINIMO_SEGUNDOS) {
      setErro("Gravação curta demais. Segure um pouco mais antes de parar.");
      mudarFase("ocioso");
      return;
    }

    mudarFase("processando");
    let pronto: Blob;
    try {
      pronto = (await converterParaOggOpus(original)) ?? original;
    } catch {
      if (!montadoRef.current) return;
      setErro("Não foi possível processar o áudio gravado. Grave de novo.");
      mudarFase("ocioso");
      return;
    }
    if (!montadoRef.current) return;

    if (pronto.size > LIMITE_BYTES) {
      setErro("O áudio passa de 16 MB (limite do WhatsApp). Grave um áudio mais curto.");
      mudarFase("ocioso");
      return;
    }

    finalRef.current = pronto;
    envioIdRef.current = crypto.randomUUID();
    setPreviewUrl(URL.createObjectURL(pronto));
    setAviso(interrompida ? "A gravação foi interrompida; ouça o que ficou salvo antes de enviar." : null);
    mudarFase("revisando");
  }

  async function comecar() {
    if (fase !== "ocioso") return;
    setErro(null);
    setAviso(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErro("Este navegador não permite gravar áudio. Use o Chrome, Edge, Firefox ou Safari atualizado, em endereço https.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const formato = FORMATOS_PREFERIDOS.find((f) => MediaRecorder.isTypeSupported(f));
      const gravador = new MediaRecorder(stream, formato ? { mimeType: formato } : undefined);
      const tipo = gravador.mimeType || formato || "audio/webm";
      let interrompida = false;

      pedacosRef.current = [];
      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data);
      };
      gravador.onerror = () => {
        interrompida = true;
        if (gravador.state !== "inactive") gravador.stop();
      };
      // Fone desconectado, permissão revogada, etc.: o stream acaba sozinho.
      stream.getAudioTracks().forEach((t) => {
        t.onended = () => {
          interrompida = true;
          if (gravador.state === "recording") gravador.stop();
        };
      });
      gravador.onstop = () => void aoTerminarGravacao(tipo, interrompida);

      gravadorRef.current = gravador;
      segundosRef.current = 0;
      setSegundos(0);
      limparAudio();
      gravador.start(1000); // pedaços de 1 s: se algo cair, o que já foi gravado não se perde
      mudarFase("gravando");
    } catch (e) {
      soltarMicrofone();
      setErro(mensagemDeErroDoMicrofone(e));
    }
  }

  function pararGravacao() {
    const gravador = gravadorRef.current;
    if (gravador && gravador.state === "recording") gravador.stop();
  }

  async function enviar() {
    const audio = finalRef.current;
    if (!audio || enviandoRef.current) return; // clique duplo
    enviandoRef.current = true;
    setErro(null);
    mudarFase("enviando");
    try {
      const extensao = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
      const form = new FormData();
      form.append("conversa_id", conversaId);
      form.append("envio_id", envioIdRef.current);
      form.append("audio", audio, `audio.${extensao}`);

      const res = await fetch("/api/chat/enviar-audio", { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
      const corpo = (await res.json().catch(() => null)) as { error?: string; enviado?: boolean; incerto?: boolean } | null;

      if (res.status === 409) {
        // Já processado numa tentativa anterior: não reenvia, só atualiza a conversa.
        limparAudio();
        setAviso("Este áudio já tinha sido enviado.");
        mudarFase("ocioso");
        onEnviadoRef.current();
        return;
      }
      if (!res.ok) {
        setErro(corpo?.error ?? "Não foi possível enviar o áudio. Tente de novo.");
        mudarFase("revisando");
        return;
      }

      limparAudio();
      onEnviadoRef.current();
      if (corpo?.incerto) {
        // Aceito pelo painel, mas sem confirmação do WhatsApp: não oferece reenviar às cegas.
        setAviso("Não deu pra confirmar o envio ao WhatsApp. O áudio está no histórico: confira se o cliente recebeu antes de reenviar.");
        mudarFase("ocioso");
        return;
      }
      mudarFase("enviado");
      setTimeout(() => {
        if (montadoRef.current) mudarFase("ocioso");
      }, 2500);
    } catch {
      // Sem resposta nenhuma (rede/tempo esgotado): pode ter saído ou não — o servidor
      // recusa o mesmo envio_id duas vezes, então "Tentar novamente" é seguro.
      setErro("Sem conexão ou tempo esgotado. Seu áudio está guardado: toque em \"Tentar novamente\".");
      mudarFase("revisando");
    } finally {
      enviandoRef.current = false;
    }
  }

  const mensagens = (erro || aviso) && (
    <p
      role="alert"
      className={
        erro
          ? "mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300"
          : "mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
      }
    >
      {erro ?? aviso}
    </p>
  );

  if (fase === "ocioso") {
    return (
      <>
        {(erro || aviso) && <div className="absolute inset-x-3 bottom-full mb-1">{mensagens}</div>}
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

  const barra = "flex items-center gap-2 rounded-xl border px-3 py-2";

  return (
    <div className="flex min-w-0 flex-1 flex-col" aria-live="polite">
      {mensagens}

      {fase === "gravando" && (
        <div className={`${barra} border-red-200 bg-red-50 dark:border-red-400/30 dark:bg-red-500/10`}>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-medium tabular-nums text-red-700 dark:text-red-300">{formatarTempo(segundos)}</span>
          <span className="flex-1 truncate text-xs text-red-600/80 dark:text-red-300/70">Gravando...</span>
          <button
            type="button"
            onClick={descartar}
            title="Cancelar gravação"
            aria-label="Cancelar gravação"
            className="rounded-lg p-2 text-red-600 transition hover:bg-red-100 dark:text-red-300 dark:hover:bg-white/10"
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            onClick={pararGravacao}
            title="Parar e ouvir"
            aria-label="Parar gravação"
            className="rounded-lg bg-red-500 p-2 text-white transition hover:bg-red-600"
          >
            <Square size={16} fill="currentColor" />
          </button>
        </div>
      )}

      {fase === "processando" && (
        <div className={`${barra} border-brand-200 bg-white dark:border-white/10 dark:bg-white/5`}>
          <Spinner size={18} />
          <span className="text-sm text-gray-700 dark:text-gray-200">Processando áudio...</span>
        </div>
      )}

      {(fase === "revisando" || fase === "enviando") && (
        <div className={`${barra} border-brand-200 bg-white dark:border-white/10 dark:bg-white/5`}>
          <button
            type="button"
            onClick={descartar}
            disabled={fase === "enviando"}
            title="Descartar áudio"
            aria-label="Descartar áudio"
            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:text-red-300 dark:hover:bg-white/10"
          >
            <Trash2 size={18} />
          </button>
          {previewUrl && <audio controls src={previewUrl} preload="metadata" className="h-9 min-w-0 flex-1" />}
          <button
            type="button"
            onClick={enviar}
            disabled={fase === "enviando"}
            title={erro ? "Tentar novamente" : "Enviar áudio"}
            aria-label={erro ? "Tentar enviar novamente" : "Enviar áudio"}
            className="flex items-center gap-1.5 rounded-lg bg-gradiente-acento px-3 py-2 text-sm font-medium text-white shadow-brilho-acento transition hover:brightness-110 disabled:opacity-70"
          >
            {fase === "enviando" ? (
              <>
                <Spinner size={16} className="text-white" />
                Enviando...
              </>
            ) : erro ? (
              <>
                <RotateCw size={16} />
                Tentar novamente
              </>
            ) : (
              <>
                <Send size={16} />
                Enviar
              </>
            )}
          </button>
        </div>
      )}

      {fase === "enviado" && (
        <div className={`${barra} border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/10`}>
          <Check size={18} className="text-emerald-600 dark:text-emerald-300" />
          <span className="text-sm text-emerald-700 dark:text-emerald-200">Enviado ao WhatsApp</span>
        </div>
      )}
    </div>
  );
}
