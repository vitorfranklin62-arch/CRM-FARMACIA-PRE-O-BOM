"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Bot,
  User,
  Headset,
  FileText,
  Camera,
  MessageSquare,
  Lock,
  Unlock,
  Ban,
  ShieldCheck,
  Maximize2,
  Minimize2,
  PanelRightOpen,
  PanelRightClose,
  ArrowLeft,
  ArrowDown,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime } from "@/lib/utils";
import { formatarTelefone } from "@/lib/telefone";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { TemplatePicker } from "./TemplatePicker";
import { MensagemMidia, RenovarLinksMidiaContext } from "./MensagemMidia";
import { GravadorAudio } from "./GravadorAudio";
import { FichaCliente, type ResumoPedidosCliente } from "./FichaCliente";
import { useChatExpandido } from "./ChatShell";
import { useConversas } from "./ChatRealtimeProvider";
import { useMensagens } from "./useMensagens";
import { SkeletonMensagens } from "./Skeletons";
import { CLASSIFICACOES } from "./classificacao";
import { Spinner } from "@/components/ui/Spinner";
import { CHAVE_CONVERSAS, type ConversaDaLista } from "@/lib/chat/conversas";
import type { ConversaCompleta, MensagemComUsuario } from "@/types/relations";
import type { ConversaClassificacao, Tag, TemplateMensagem } from "@/types/database";

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

// Foto ou áudio com mídia carregada (ver MensagemMidia). Sem midia_url (link
// assinado ainda não gerado, ou arquivo não baixou — ver src/lib/chat-midia.ts)
// a legenda/transcrição em `conteudo` aparece como reserva.
function temMidiaVisivel(msg: MensagemComUsuario) {
  return !!msg.midia_url && (msg.tipo === "imagem" || msg.tipo === "audio");
}

// Distância do fim (px) em que ainda consideramos que a pessoa "está no fim" da conversa.
const PERTO_DO_FIM_PX = 80;
// Rolou até perto do topo: carrega as mensagens anteriores.
const PERTO_DO_TOPO_PX = 120;

export function MessageThread({
  conversa: conversaDoServidor,
  templates,
  tagsDisponiveis,
  resumoPedidos,
}: {
  conversa: ConversaCompleta;
  templates: TemplateMensagem[];
  tagsDisponiveis: Tag[];
  resumoPedidos: ResumoPedidosCliente;
}) {
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [travando, setTravando] = useState(false);
  const [bloqueando, setBloqueando] = useState(false);
  const [gravandoAudio, setGravandoAudio] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);
  const [classificando, setClassificando] = useState<ConversaClassificacao | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { expandido, alternar: alternarExpandido } = useChatExpandido();
  const {
    mensagens,
    carregando,
    erro: erroMensagens,
    tentarDeNovo,
    temMaisAntigas,
    carregandoAntigas,
    carregarAntigas,
    sincronizar,
    renovarLinks,
  } = useMensagens(conversaDoServidor.id);

  // Status/classificação ao vivo: o cache da lista é atualizado pelo Realtime,
  // então mudança feita por outra atendente aparece aqui na hora, sem
  // recarregar. O resto (cliente, tags) vem do servidor.
  const { data: conversasAoVivo } = useConversas();
  const aoVivo = conversasAoVivo?.find((c) => c.id === conversaDoServidor.id);
  const conversa = useMemo(
    () =>
      aoVivo
        ? {
            ...conversaDoServidor,
            status: aoVivo.status,
            classificacao: aoVivo.classificacao,
            clientes: conversaDoServidor.clientes && aoVivo.clientes
              ? { ...conversaDoServidor.clientes, ia_bloqueada: aoVivo.clientes.ia_bloqueada }
              : conversaDoServidor.clientes,
          }
        : conversaDoServidor,
    [conversaDoServidor, aoVivo]
  );

  /** Muda a conversa no cache na hora (a tela responde ao clique sem esperar o banco). */
  function atualizarNoCache(mudar: (c: ConversaDaLista) => ConversaDaLista) {
    queryClient.setQueryData<ConversaDaLista[]>(CHAVE_CONVERSAS, (lista) =>
      lista?.map((c) => (c.id === conversaDoServidor.id ? mudar(c) : c))
    );
  }

  const travada = conversa.status === "aguardando_humano";
  const numeroBloqueado = conversa.clientes?.ia_bloqueada ?? false;
  const classificacaoAtual = conversa.classificacao ?? "aberta";

  // Em tela larga a ficha já abre do lado; em tela menor ela vira um painel
  // por cima da conversa, aberto só quando a pessoa clica no botão.
  useEffect(() => {
    setFichaAberta(window.matchMedia("(min-width: 1280px)").matches);
  }, []);

  // Classificação do atendimento (Aberta / Aguardando o cliente / Resolvida).
  // Não mexe na IA — quem trava/destrava a IA é o botão de cadeado.
  async function classificar(valor: ConversaClassificacao) {
    if (classificando || valor === classificacaoAtual) return;
    setClassificando(valor);
    const anterior = classificacaoAtual;
    atualizarNoCache((c) => ({ ...c, classificacao: valor }));
    const supabase = createClient();
    const { error } = await supabase.from("conversas").update({ classificacao: valor }).eq("id", conversa.id);
    if (error) {
      atualizarNoCache((c) => ({ ...c, classificacao: anterior }));
      alert("Não foi possível mudar a classificação. A migração 20261023_chat_classificacao_e_nao_lidas.sql já foi rodada no Supabase?");
    }
    setClassificando(null);
  }

  // Trava/destrava a IA só NESTA conversa — reaproveita o mesmo status que já
  // é setado sozinho quando uma funcionária responde manualmente (ver
  // /api/chat/enviar). Aqui vira um botão explícito, sem precisar mandar
  // mensagem pra "tomar conta" da conversa.
  async function alternarTrava() {
    if (travando) return;
    setTravando(true);
    const statusAnterior = conversa.status;
    const novoStatus = travada ? "aberta" : "aguardando_humano";
    atualizarNoCache((c) => ({ ...c, status: novoStatus }));
    const supabase = createClient();
    const { error } = await supabase
      .from("conversas")
      .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
      .eq("id", conversa.id);
    if (error) {
      atualizarNoCache((c) => ({ ...c, status: statusAnterior }));
      alert("Não foi possível travar/destravar a IA nesta conversa.");
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
      // `clientes` não está no Realtime: atualiza a lista na hora e o cabeçalho pelo servidor.
      atualizarNoCache((c) => (c.clientes ? { ...c, clientes: { ...c.clientes, ia_bloqueada: !numeroBloqueado } } : c));
      router.refresh();
    }
    setBloqueando(false);
  }

  // ---- Rolagem ----------------------------------------------------------
  // Mensagem nova só rola até o fim se a pessoa já estava no fim (ou se foi
  // ela que enviou); senão aparece o botão "Novas mensagens". Ao carregar as
  // anteriores (rolando pra cima), a posição da tela é mantida.
  const listaRef = useRef<HTMLDivElement>(null);
  const pertoDoFimRef = useRef(true);
  const distanciaDoFimAntesRef = useRef<number | null>(null);
  const ultimaIdVistaRef = useRef<string | null>(null);
  const [novasAbaixo, setNovasAbaixo] = useState(false);
  const primeiraId = mensagens[0]?.id;
  const ultimaId = mensagens.at(-1)?.id;

  function irParaOFim(suave: boolean) {
    const el = listaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: suave ? "smooth" : "auto" });
    pertoDoFimRef.current = true;
    setNovasAbaixo(false);
  }

  function aoRolar() {
    const el = listaRef.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM_PX;
    pertoDoFimRef.current = perto;
    if (perto) setNovasAbaixo(false);
    if (el.scrollTop < PERTO_DO_TOPO_PX && temMaisAntigas && !carregandoAntigas) {
      distanciaDoFimAntesRef.current = el.scrollHeight - el.scrollTop;
      carregarAntigas();
    }
  }

  // Mensagens anteriores entraram em cima: devolve a tela pro mesmo ponto.
  useLayoutEffect(() => {
    const el = listaRef.current;
    if (!el || distanciaDoFimAntesRef.current === null) return;
    el.scrollTop = el.scrollHeight - distanciaDoFimAntesRef.current;
    distanciaDoFimAntesRef.current = null;
  }, [primeiraId]);

  // Chegou mensagem no fim.
  useLayoutEffect(() => {
    if (!ultimaId) return;
    const primeiraVez = ultimaIdVistaRef.current === null;
    ultimaIdVistaRef.current = ultimaId;
    if (primeiraVez || pertoDoFimRef.current) irParaOFim(!primeiraVez);
    else setNovasAbaixo(true);
  }, [ultimaId]);

  async function sendMessage(conteudo: string) {
    const trimmed = conteudo.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setErroEnvio(false);
    try {
      const res = await fetch("/api/chat/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa_id: conversa.id, conteudo: trimmed }),
      });
      if (!res.ok) throw new Error();
      setTexto("");
      // Quem enviou quer ver a própria mensagem: rola até o fim quando ela chegar.
      pertoDoFimRef.current = true;
      sincronizar();
    } catch {
      setErroEnvio(true);
    }
    setSending(false);
  }

  const botaoIcone =
    "rounded-xl p-2 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-white/10";

  return (
    <div className="relative flex h-full min-h-0">
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-brand-100/70 bg-gradient-to-r from-brand-50/80 via-white to-accent-50/50 px-4 py-3 dark:border-white/10 dark:from-brand-500/15 dark:via-navy-800/40 dark:to-accent-500/10 sm:px-5">
        <div className="flex items-center gap-3">
          {!expandido && (
            <Link
              href="/chat"
              title="Voltar pra lista"
              className="-ml-1 rounded-xl p-1.5 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-white/10 md:hidden"
            >
              <ArrowLeft size={18} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setFichaAberta((v) => !v)}
            disabled={!conversa.clientes}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            title="Ver ficha do cliente"
          >
            <Avatar nome={conversa.clientes?.nome ?? "?"} fotoUrl={conversa.clientes?.foto_url} size={38} comAnel />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{conversa.clientes?.nome ?? "Cliente"}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                {conversa.clientes?.origem_chat === "instagram" ? (
                  <Camera size={11} className="text-fuchsia-500 dark:text-fuchsia-400" />
                ) : (
                  <MessageSquare size={11} className="text-emerald-500 dark:text-emerald-400" />
                )}
                {formatarTelefone(conversa.clientes?.telefone)}
              </p>
            </div>
          </button>
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
              className="hidden sm:inline-flex"
            >
              {conversa.status === "aberta" ? "IA ativa" : conversa.status === "aguardando_humano" ? "Precisa de você" : "Fechada"}
            </Badge>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {/* Classificador do atendimento */}
          <div
            role="radiogroup"
            aria-label="Classificar conversa"
            className="flex rounded-xl bg-white/80 p-0.5 ring-1 ring-inset ring-brand-100 dark:bg-white/5 dark:ring-white/10"
          >
            {CLASSIFICACOES.map((c) => {
              const ativo = classificacaoAtual === c.valor;
              const Icone = c.icone;
              return (
                <button
                  key={c.valor}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => classificar(c.valor)}
                  disabled={!!classificando}
                  title={c.label}
                  aria-label={c.label}
                  className={cn(
                    "flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-wait",
                    ativo ? c.ativo : "text-gray-500 hover:bg-brand-50 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-white/10",
                    classificando === c.valor && "animate-pulse"
                  )}
                >
                  <Icone size={13} />
                  <span className="hidden sm:inline">{c.valor === "aguardando_cliente" ? "Aguardando cliente" : c.label}</span>
                  <span className="sm:hidden">{c.curto}</span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1">
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
            <button
              type="button"
              onClick={() => setFichaAberta((v) => !v)}
              disabled={!conversa.clientes}
              title={fichaAberta ? "Esconder ficha do cliente" : "Mostrar ficha do cliente"}
              className={cn(botaoIcone, fichaAberta && "bg-brand-50 text-brand-600 dark:bg-white/10 dark:text-brand-200")}
            >
              {fichaAberta ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            </button>
            <button
              type="button"
              onClick={alternarExpandido}
              title={expandido ? "Recolher conversa (Esc)" : "Expandir conversa (tela cheia)"}
              className={cn(botaoIcone, expandido && "bg-brand-50 text-brand-600 dark:bg-white/10 dark:text-brand-200")}
            >
              {expandido ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
        </div>
      </div>

      <RenovarLinksMidiaContext.Provider value={renovarLinks}>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={listaRef}
        onScroll={aoRolar}
        className="rolagem-fina flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-transparent via-brand-50/25 to-accent-50/25 px-5 py-4 dark:via-brand-500/[0.06] dark:to-accent-500/[0.05]"
      >
        {carregando && <SkeletonMensagens />}
        {erroMensagens && !carregando && (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>Não foi possível carregar as mensagens.</p>
            <button type="button" onClick={() => tentarDeNovo()} className="mt-2 font-semibold text-brand-600 hover:underline dark:text-brand-300">
              Tentar de novo
            </button>
          </div>
        )}
        {!carregando && !erroMensagens && mensagens.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Sem mensagens ainda.</p>
        )}
        {carregandoAntigas && (
          <div className="flex justify-center py-1">
            <Spinner size={18} />
          </div>
        )}
        {!carregando && !temMaisAntigas && mensagens.length > 0 && (
          <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">Início da conversa</p>
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
                {/* Em foto/áudio o texto é só a descrição/transcrição que a IA usa — não aparece pra equipe */}
                {!temMidiaVisivel(msg) && <p className="whitespace-pre-wrap text-sm">{msg.conteudo}</p>}
                <p className="mt-1 text-[10px] opacity-60">{formatDateTime(msg.criado_em)}</p>
              </div>
            </div>
          );
        })}
      </div>
      {novasAbaixo && (
        <button
          type="button"
          onClick={() => irParaOFim(true)}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-card-md transition hover:bg-emerald-600"
        >
          <ArrowDown size={14} /> Novas mensagens
        </button>
      )}
      </div>
      </RenovarLinksMidiaContext.Provider>

      <div className="relative border-t border-brand-100/70 bg-gradient-to-r from-brand-50/50 via-white to-accent-50/40 p-3 dark:border-white/10 dark:from-brand-500/10 dark:via-navy-800/40 dark:to-accent-500/10">
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
          <p role="alert" className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
            Não foi possível enviar. Confira a conexão e tente de novo — o texto continua aí.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(texto);
          }}
          className="flex items-end gap-2"
        >
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            title="Usar template"
            className="rounded-xl p-2.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-white/10"
          >
            <FileText size={18} />
          </button>
          <GravadorAudio
            conversaId={conversa.id}
            onEnviado={() => {
              pertoDoFimRef.current = true;
              sincronizar();
            }}
            onOcupadoChange={setGravandoAudio}
          />
          {!gravandoAudio && (
            <>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(texto);
                  }
                }}
                rows={1}
                placeholder="Digite uma mensagem..."
                className="flex-1 resize-none rounded-xl border border-brand-200/80 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-brand-500/25"
              />
              <button
                type="submit"
                disabled={sending || !texto.trim()}
                className="rounded-xl bg-gradiente-acento p-2.5 text-white shadow-brilho-acento transition hover:brightness-110 disabled:bg-none disabled:bg-accent-200 disabled:shadow-none"
              >
                <Send size={18} />
              </button>
            </>
          )}
        </form>
      </div>
    </div>

    {fichaAberta && conversa.clientes && (
      <>
        {/* Em tela menor a ficha fica por cima da conversa; um toque fora fecha. */}
        <button
          type="button"
          aria-label="Fechar ficha"
          onClick={() => setFichaAberta(false)}
          className="absolute inset-0 z-10 bg-black/20 xl:hidden"
        />
        <div className="absolute inset-y-0 right-0 z-20 w-[19rem] max-w-[90%] border-l border-brand-100/70 shadow-xl dark:border-white/10 xl:static xl:z-auto xl:w-80 xl:max-w-none xl:shrink-0 xl:shadow-none">
          <FichaCliente
            cliente={conversa.clientes}
            resumo={resumoPedidos}
            tagsDisponiveis={tagsDisponiveis}
            onFechar={() => setFichaAberta(false)}
          />
        </div>
      </>
    )}
    </div>
  );
}
