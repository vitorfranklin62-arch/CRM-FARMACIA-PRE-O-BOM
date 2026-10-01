"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Bot, User, Headset, FileText, Camera, MessageSquare, Lock, Unlock, Ban, ShieldCheck, Tag as TagIcon, Paperclip, Mic, Square, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime, maskPhone } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { TagPills } from "@/components/clientes/TagPills";
import { TagsManagerModal } from "@/components/clientes/TagsManagerModal";
import { TemplatePicker } from "./TemplatePicker";
import {
  ACCEPT_ANEXO,
  LIMITES_BYTES,
  MENSAGEM_FORMATO_INVALIDO,
  extensaoPorMime,
  mensagemLimite,
  mimeBase,
  textoPadraoMidia,
  tipoPorMime,
} from "@/lib/chat-midia-tipos";
import type { ConversaCompleta, MensagemComUsuario } from "@/types/relations";
import type { Tag, TemplateMensagem } from "@/types/database";

// Cada remetente tem sua própria cor: a IA em violeta claro, o cliente no azul
// da marca e a equipe em verde. Assim dá pra ler a conversa só pelas cores.
const REMETENTE_STYLE = {
  ia: {
    align: "justify-start",
    bubble:
      "rounded-bl-md bg-gradient-to-br from-violet-50 to-brand-50 text-gray-900 ring-1 ring-inset ring-violet-200/70 dark:from-violet-500/15 dark:to-brand-500/10 dark:text-gray-100 dark:ring-violet-400/20",
    icon: Bot,
    label: "IA",
  },
  cliente: {
    align: "justify-start",
    bubble: "rounded-bl-md bg-gradiente-marca text-white shadow-brilho-marca",
    icon: User,
    label: "Cliente",
  },
  funcionaria: {
    align: "justify-end",
    bubble: "rounded-br-md bg-gradiente-sucesso text-white shadow-brilho-sucesso",
    icon: Headset,
    label: "Você",
  },
} as const;

// Foto, áudio ou PDF que o cliente mandou pelo WhatsApp. Sem midia_url (link
// assinado ainda não gerado, ou arquivo não baixou — ver src/lib/chat-midia.ts)
// não mostra nada, e a legenda/transcrição em `conteudo` continua aparecendo normal.
function MensagemMidia({ msg }: { msg: MensagemComUsuario }) {
  if (!msg.midia_url) return null;

  if (msg.tipo === "imagem") {
    return (
      <a href={msg.midia_url} target="_blank" rel="noopener noreferrer" className="mb-1.5 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage, next/image não otimiza */}
        <img
          src={msg.midia_url}
          alt={msg.midia_nome ?? "Imagem enviada pelo cliente"}
          className="max-h-64 w-auto rounded-lg object-cover"
        />
      </a>
    );
  }

  if (msg.tipo === "audio") {
    return (
      <audio controls preload="none" src={msg.midia_url} className="mb-1.5 h-9 max-w-full">
        Seu navegador não consegue tocar áudio.
      </audio>
    );
  }

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

export function MessageThread({
  conversa,
  initialMensagens,
  templates,
  tagsDisponiveis,
}: {
  conversa: ConversaCompleta;
  initialMensagens: MensagemComUsuario[];
  templates: TemplateMensagem[];
  tagsDisponiveis: Tag[];
}) {
  const [mensagens, setMensagens] = useState(initialMensagens);
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [travando, setTravando] = useState(false);
  const [bloqueando, setBloqueando] = useState(false);
  const [gerenciandoTags, setGerenciandoTags] = useState(false);
  const [anexo, setAnexo] = useState<{ file: File; previewUrl: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const descartarGravacaoRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const travada = conversa.status === "aguardando_humano";
  const numeroBloqueado = conversa.clientes?.ia_bloqueada ?? false;

  // Trava/destrava a IA só NESTA conversa — reaproveita o mesmo status que já
  // é setado sozinho quando uma funcionária responde manualmente (ver
  // /api/chat/enviar). Aqui vira um botão explícito, sem precisar mandar
  // mensagem pra "tomar conta" da conversa.
  async function alternarTrava() {
    if (travando) return;
    setTravando(true);
    const novoStatus = travada ? "aberta" : "aguardando_humano";
    const supabase = createClient();
    const { error } = await supabase
      .from("conversas")
      .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
      .eq("id", conversa.id);
    if (!error) {
      router.refresh();
    }
    setTravando(false);
  }

  // Bloqueio permanente do número — diferente da trava acima, vale pra
  // qualquer conversa futura desse cliente, não só a atual.
  async function alternarBloqueioNumero() {
    if (bloqueando || !conversa.clientes) return;
    const acao = numeroBloqueado ? "desbloquear" : "bloquear";
    if (!confirm(`Tem certeza que quer ${acao} a IA pra este número? ${numeroBloqueado ? "A IA volta a responder normalmente." : "A IA para de responder automaticamente em qualquer conversa futura, até você desbloquear."}`)) {
      return;
    }
    setBloqueando(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("clientes")
      .update({
        ia_bloqueada: !numeroBloqueado,
        ...(numeroBloqueado ? {} : { ia_bloqueada_em: new Date().toISOString() }),
      })
      .eq("id", conversa.clientes.id);
    if (!error) {
      router.refresh();
    }
    setBloqueando(false);
  }

  useEffect(() => setMensagens(initialMensagens), [initialMensagens]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`mensagens-${conversa.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `conversa_id=eq.${conversa.id}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversa.id, router]);

  // Troca o anexo escolhido (liberando a prévia anterior da memória).
  function definirAnexo(file: File | null) {
    setAnexo((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior.previewUrl);
      return file ? { file, previewUrl: URL.createObjectURL(file) } : null;
    });
  }

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const tipo = tipoPorMime(file.type);
    if (!tipo) return setErroEnvio(MENSAGEM_FORMATO_INVALIDO);
    if (file.size > LIMITES_BYTES[tipo]) return setErroEnvio(mensagemLimite(tipo));

    setErroEnvio(null);
    definirAnexo(file);
  }

  async function iniciarGravacao() {
    if (gravando) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErroEnvio("Este navegador não permite gravar áudio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimePreferido = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const gravador = new MediaRecorder(stream, mimePreferido ? { mimeType: mimePreferido } : undefined);
      const pedacos: Blob[] = [];
      descartarGravacaoRef.current = false;

      gravador.ondataavailable = (ev) => {
        if (ev.data.size > 0) pedacos.push(ev.data);
      };
      gravador.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setGravando(false);
        if (descartarGravacaoRef.current || pedacos.length === 0) return;

        const mime = mimeBase(gravador.mimeType || mimePreferido || "audio/webm");
        const arquivo = new File([new Blob(pedacos, { type: mime })], `audio-${Date.now()}.${extensaoPorMime(mime) ?? "webm"}`, {
          type: mime,
        });
        if (arquivo.size > LIMITES_BYTES.audio) return setErroEnvio(mensagemLimite("audio"));
        definirAnexo(arquivo);
      };

      gravadorRef.current = gravador;
      gravador.start();
      setSegundos(0);
      setGravando(true);
      setErroEnvio(null);
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      setErroEnvio("Não consegui usar o microfone. Libere a permissão do microfone no navegador e tente de novo.");
    }
  }

  function pararGravacao(descartar = false) {
    descartarGravacaoRef.current = descartar;
    gravadorRef.current?.stop();
  }

  // Ao sair da conversa no meio de uma gravação, solta o microfone e a prévia.
  useEffect(() => {
    return () => {
      descartarGravacaoRef.current = true;
      if (gravadorRef.current?.state === "recording") gravadorRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function enviar() {
    const tipoAnexo = anexo ? tipoPorMime(anexo.file.type) : null;
    // Áudio de voz não leva legenda no WhatsApp — só foto e PDF.
    const legenda = tipoAnexo === "audio" ? "" : texto.trim();
    if ((!legenda && !anexo) || sending || gravando) return;

    setSending(true);
    setErroEnvio(null);
    try {
      let res: Response;
      if (anexo) {
        const form = new FormData();
        form.append("conversa_id", conversa.id);
        form.append("file", anexo.file);
        if (legenda) form.append("legenda", legenda);
        res = await fetch("/api/chat/enviar", { method: "POST", body: form });
      } else {
        res = await fetch("/api/chat/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversa_id: conversa.id, conteudo: legenda }),
        });
      }

      const dados = await res.json().catch(() => null);
      if (res.ok) {
        setTexto("");
        definirAnexo(null);
        if (dados?.aviso) setErroEnvio(dados.aviso);
        router.refresh();
      } else {
        setErroEnvio(dados?.error ?? "Não foi possível enviar a mensagem.");
      }
    } catch {
      setErroEnvio("Sem conexão. Tente de novo.");
    }
    setSending(false);
  }

  const tipoAnexoAtual = anexo ? tipoPorMime(anexo.file.type) : null;
  const podeEnviar = !sending && !gravando && (!!texto.trim() || !!anexo);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-brand-100/70 bg-gradient-to-r from-brand-50/80 via-white to-accent-50/50 px-5 py-3.5 dark:border-white/10 dark:from-brand-500/15 dark:via-navy-800/40 dark:to-accent-500/10">
        <div className="flex items-center gap-3">
          <Avatar nome={conversa.clientes?.nome ?? "?"} fotoUrl={conversa.clientes?.foto_url} size={38} comAnel />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{conversa.clientes?.nome ?? "Cliente"}</p>
            <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              {conversa.clientes?.origem_chat === "instagram" ? (
                <Camera size={11} className="text-fuchsia-500 dark:text-fuchsia-400" />
              ) : (
                <MessageSquare size={11} className="text-emerald-500 dark:text-emerald-400" />
              )}
              {maskPhone(conversa.clientes?.telefone)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {numeroBloqueado && (
              <Badge variant="red" comBolinha className="hidden sm:inline-flex">
                IA bloqueada
              </Badge>
            )}
            <Badge
              variant={conversa.status === "fechada" ? "gray" : conversa.status === "aguardando_humano" ? "yellow" : "blue"}
              comBolinha
              pulsando={conversa.status === "aguardando_humano"}
            >
              {conversa.status === "aberta" ? "IA ativa" : conversa.status === "aguardando_humano" ? "Precisa de você" : "Fechada"}
            </Badge>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <TagPills
            tags={conversa.clientes?.cliente_tags ?? []}
            onClick={conversa.clientes ? () => setGerenciandoTags(true) : undefined}
            emptyLabel="+ adicionar tag"
            className="min-w-0"
          />
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setGerenciandoTags(true)}
              disabled={!conversa.clientes}
              title="Gerenciar tags deste cliente"
              className="rounded-xl p-2 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-white/10"
            >
              <TagIcon size={17} />
            </button>
            <button
              type="button"
              onClick={alternarTrava}
              disabled={travando}
              title={travada ? "Destravar: deixar a IA responder de novo nesta conversa" : "Travar: a IA para de responder nesta conversa até você destravar"}
              className={cn(
                "rounded-xl p-2 transition disabled:opacity-50",
                travada
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
                  : "text-gray-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-white/10"
              )}
            >
              {travada ? <Lock size={17} /> : <Unlock size={17} />}
            </button>
            <button
              type="button"
              onClick={alternarBloqueioNumero}
              disabled={bloqueando || !conversa.clientes}
              title={numeroBloqueado ? "Desbloquear IA para este número" : "Bloquear IA para este número (vale pra todas as conversas futuras)"}
              className={cn(
                "rounded-xl p-2 transition disabled:opacity-50",
                numeroBloqueado
                  ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25"
                  : "text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-white/10"
              )}
            >
              {numeroBloqueado ? <ShieldCheck size={17} /> : <Ban size={17} />}
            </button>
          </div>
        </div>
      </div>

      {conversa.clientes && (
        <TagsManagerModal
          open={gerenciandoTags}
          onClose={() => setGerenciandoTags(false)}
          clienteId={conversa.clientes.id}
          clienteNome={conversa.clientes.nome}
          tagsAtuais={conversa.clientes.cliente_tags}
          tagsDisponiveis={tagsDisponiveis}
        />
      )}

      <div className="rolagem-fina flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-transparent via-brand-50/25 to-accent-50/25 px-5 py-4 dark:via-brand-500/[0.06] dark:to-accent-500/[0.05]">
        {mensagens.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Sem mensagens ainda.</p>
        )}
        {mensagens.map((msg) => {
          const style = REMETENTE_STYLE[msg.remetente];
          const Icon = style.icon;
          return (
            <div key={msg.id} className={cn("flex", style.align)}>
              <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2.5 transition", style.bubble)}>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] opacity-70">
                  <Icon size={11} />
                  {msg.remetente === "funcionaria" && msg.usuarios ? msg.usuarios.nome : style.label}
                </div>
                <MensagemMidia msg={msg} />
                {!(msg.tipo !== "texto" && msg.conteudo === textoPadraoMidia(msg.tipo, msg.midia_nome)) && (
                  <p className="whitespace-pre-wrap text-sm">{msg.conteudo}</p>
                )}
                <p className="mt-1 text-[10px] opacity-60">{formatDateTime(msg.criado_em)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-brand-100/70 bg-gradient-to-r from-brand-50/50 via-white to-accent-50/40 p-3 dark:border-white/10 dark:from-brand-500/10 dark:via-navy-800/40 dark:to-accent-500/10">
        {showTemplates && (
          <TemplatePicker
            templates={templates}
            onSelect={(conteudo) => {
              setTexto(conteudo);
              setShowTemplates(false);
            }}
            onClose={() => setShowTemplates(false)}
          />
        )}
        {erroEnvio && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {erroEnvio}
          </p>
        )}
        {gravando && (
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="flex-1">
              Gravando… {String(Math.floor(segundos / 60)).padStart(2, "0")}:{String(segundos % 60).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => pararGravacao(true)}
              title="Descartar gravação"
              className="rounded-lg p-1.5 hover:bg-red-100 dark:hover:bg-red-500/20"
            >
              <X size={16} />
            </button>
            <button
              type="button"
              onClick={() => pararGravacao(false)}
              title="Parar e anexar"
              className="rounded-lg bg-red-500 p-1.5 text-white hover:bg-red-600"
            >
              <Square size={14} />
            </button>
          </div>
        )}
        {anexo && !gravando && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-brand-200/80 bg-white p-2 dark:border-white/10 dark:bg-white/5">
            {tipoAnexoAtual === "imagem" && (
              // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) do arquivo escolhido
              <img src={anexo.previewUrl} alt="Prévia do anexo" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            )}
            {tipoAnexoAtual === "audio" && (
              <audio controls src={anexo.previewUrl} className="h-9 min-w-0 flex-1" />
            )}
            {tipoAnexoAtual === "documento" && (
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                <FileText size={18} className="shrink-0 text-brand-500" />
                <span className="truncate">{anexo.file.name}</span>
              </span>
            )}
            {tipoAnexoAtual === "imagem" && (
              <span className="min-w-0 flex-1 truncate text-sm text-gray-600 dark:text-gray-300">{anexo.file.name}</span>
            )}
            <button
              type="button"
              onClick={() => definirAnexo(null)}
              title="Remover anexo"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          className="flex items-end gap-2"
        >
          <input ref={inputArquivoRef} type="file" accept={ACCEPT_ANEXO} onChange={aoEscolherArquivo} className="hidden" />
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            title="Usar template"
            className="rounded-xl p-2.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-white/10"
          >
            <FileText size={18} />
          </button>
          <button
            type="button"
            onClick={() => inputArquivoRef.current?.click()}
            disabled={gravando}
            title="Anexar foto, PDF ou áudio"
            className="rounded-xl p-2.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-white/10"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            onClick={iniciarGravacao}
            disabled={gravando || !!anexo}
            title="Gravar áudio"
            className="rounded-xl p-2.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-white/10"
          >
            <Mic size={18} />
          </button>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={1}
            disabled={tipoAnexoAtual === "audio"}
            placeholder={
              tipoAnexoAtual === "audio"
                ? "Áudio vai sem legenda"
                : anexo
                  ? "Legenda (opcional)..."
                  : "Digite uma mensagem..."
            }
            className="flex-1 resize-none rounded-xl border border-brand-200/80 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-brand-500/25"
          />
          <button
            type="submit"
            disabled={!podeEnviar}
            className="rounded-xl bg-gradiente-acento p-2.5 text-white shadow-brilho-acento transition hover:brightness-110 disabled:bg-none disabled:bg-accent-200 disabled:shadow-none"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
