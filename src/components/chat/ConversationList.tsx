"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, Camera, Ban, Search, Mic, FileText, Image as ImageIcon } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CLASSIFICACAO_POR_VALOR } from "./classificacao";
import { SkeletonListaConversas } from "./Skeletons";
import type { ConversaDaLista } from "@/lib/chat/conversas";

const STATUS_VARIANT = {
  aberta: "blue",
  aguardando_humano: "yellow",
  fechada: "gray",
} as const;

const STATUS_LABEL = {
  aberta: "IA ativa",
  aguardando_humano: "Precisa de você",
  fechada: "Fechada",
} as const;

/** Barrinha colorida na lateral do item, na cor do status da conversa. */
const STATUS_BARRA = {
  aberta: "bg-gradient-to-b from-brand-400 to-brand-600",
  aguardando_humano: "bg-gradient-to-b from-amber-400 to-orange-500",
  fechada: "bg-gradient-to-b from-slate-300 to-slate-400",
} as const;

// Abas no estilo do WhatsApp: "Não lidos" olha o contador de mensagens não
// abertas; as outras três olham a classificação escolhida pela equipe.
const FILTROS = [
  { valor: "todos", label: "Todos", passa: () => true },
  { valor: "nao_lidos", label: "Não lidos", passa: (c: ConversaDaLista) => (c.nao_lidas ?? 0) > 0 },
  { valor: "aberta", label: "Abertas", passa: (c: ConversaDaLista) => (c.classificacao ?? "aberta") === "aberta" },
  { valor: "aguardando_cliente", label: "Aguardando", passa: (c: ConversaDaLista) => c.classificacao === "aguardando_cliente" },
  { valor: "resolvida", label: "Resolvidos", passa: (c: ConversaDaLista) => c.classificacao === "resolvida" },
] as const;

type Filtro = (typeof FILTROS)[number]["valor"];

const CHAVE_FILTRO = "chat:filtro";

export function ConversationList({
  conversas: conversasCarregadas,
  carregando,
  erro,
  onTentarDeNovo,
  selectedId,
}: {
  conversas: ConversaDaLista[] | undefined;
  carregando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
  selectedId?: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const conversas = useMemo(() => conversasCarregadas ?? [], [conversasCarregadas]);

  // "há 3 min" precisa andar sozinho: re-renderiza a lista a cada minuto.
  const [, setAgora] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Lembra a aba escolhida entre uma visita e outra ao Chat.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_FILTRO);
      if (salvo && FILTROS.some((f) => f.valor === salvo)) setFiltro(salvo as Filtro);
    } catch {
      // Sem localStorage (aba anônima/bloqueado): fica em "Todos".
    }
  }, []);

  function escolherFiltro(valor: Filtro) {
    setFiltro(valor);
    try {
      localStorage.setItem(CHAVE_FILTRO, valor);
    } catch {
      // idem
    }
  }

  const contagens = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.valor, conversas.filter(f.passa).length])) as Record<Filtro, number>,
    [conversas]
  );

  const termo = busca.trim().toLowerCase();
  const termoDigitos = termo.replace(/\D/g, "");
  const filtroAtual = FILTROS.find((f) => f.valor === filtro) ?? FILTROS[0];
  const visiveis = conversas.filter(
    (c) =>
      filtroAtual.passa(c) &&
      (!termo ||
        c.clientes?.nome.toLowerCase().includes(termo) ||
        (termoDigitos.length >= 3 && c.clientes?.telefone.includes(termoDigitos)))
  );

  const rolagemRef = useRef<HTMLDivElement>(null);
  const virtualizador = useVirtualizer({
    count: visiveis.length,
    getScrollElement: () => rolagemRef.current,
    estimateSize: () => 92,
    overscan: 8,
    getItemKey: (indice) => visiveis[indice].id,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-brand-100/70 px-3 py-2.5 dark:border-white/10">
        <label className="flex items-center gap-2 rounded-xl border border-brand-200/70 bg-white px-2.5 py-1.5 text-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 dark:border-white/10 dark:bg-white/5 dark:focus-within:ring-brand-500/25">
          <Search size={14} className="shrink-0 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou número"
            className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar conversas">
          {FILTROS.map((f) => {
            const ativo = filtro === f.valor;
            const qtd = contagens[f.valor];
            return (
              <button
                key={f.valor}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => escolherFiltro(f.valor)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                  ativo
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-white text-gray-600 ring-1 ring-inset ring-brand-100 hover:bg-brand-50 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/10"
                )}
              >
                {f.label}
                {f.valor !== "todos" && qtd > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] leading-4",
                      ativo ? "bg-white/25" : "bg-brand-50 text-brand-700 dark:bg-white/10 dark:text-gray-200"
                    )}
                  >
                    {qtd}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={rolagemRef} className="rolagem-fina flex-1 overflow-y-auto">
        {carregando && <SkeletonListaConversas />}
        {erro && !carregando && (
          <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>Não foi possível carregar as conversas.</p>
            <button type="button" onClick={onTentarDeNovo} className="mt-2 font-semibold text-brand-600 hover:underline dark:text-brand-300">
              Tentar de novo
            </button>
          </div>
        )}
        {!carregando && !erro && visiveis.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            {conversas.length === 0 ? "Nenhuma conversa ainda." : "Nenhuma conversa neste filtro."}
          </p>
        )}
        {/* Lista virtualizada: só os itens visíveis (e alguns em volta) existem na tela. */}
        <div className="relative w-full" style={{ height: virtualizador.getTotalSize() }}>
          {virtualizador.getVirtualItems().map((linha) => {
            const conversa = visiveis[linha.index];
            return (
              <div
                key={linha.key}
                data-index={linha.index}
                ref={virtualizador.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${linha.start}px)` }}
              >
                <ItemConversa
                  conversa={conversa}
                  selecionada={selectedId === conversa.id}
                  tempo={formatRelativeTime(conversa.atualizado_em)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Um item da lista. Memoizado: quando chega mensagem numa conversa, só o item
 * dela (e a ordem) muda — os outros não renderizam de novo.
 */
const ItemConversa = memo(function ItemConversa({
  conversa,
  selecionada,
  tempo,
}: {
  conversa: ConversaDaLista;
  selecionada: boolean;
  tempo: string;
}) {
  const naoLidas = conversa.nao_lidas ?? 0;
  const classificacao = CLASSIFICACAO_POR_VALOR[conversa.classificacao ?? "aberta"];
  return (
    <Link
      href={`/chat/${conversa.id}`}
      className={cn(
        "relative flex items-start gap-3 border-b border-brand-100/50 py-3 pl-5 pr-4 transition hover:bg-brand-50/70 dark:border-white/5 dark:hover:bg-white/5",
        selecionada &&
          "bg-gradient-to-r from-brand-100/90 to-brand-50/30 hover:from-brand-100 dark:from-brand-500/20 dark:to-transparent"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-2 left-1.5 w-1 rounded-full transition-opacity",
          STATUS_BARRA[conversa.status],
          selecionada ? "opacity-100" : "opacity-40"
        )}
      />
      <Avatar
        nome={conversa.clientes?.nome ?? "?"}
        fotoUrl={conversa.clientes?.foto_url}
        size={38}
        comAnel={selecionada}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm text-gray-900 dark:text-white",
              naoLidas > 0 ? "font-bold" : "font-semibold",
              selecionada && "text-brand-800 dark:text-brand-100"
            )}
          >
            {conversa.clientes?.nome ?? "Cliente"}
          </p>
          <span
            className={cn(
              "shrink-0 text-[11px] font-medium",
              naoLidas > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"
            )}
          >
            {tempo}
          </span>
        </div>
        <PreviaUltimaMensagem conversa={conversa} destaque={naoLidas > 0} />
        <div className="mt-1 flex items-center gap-1.5">
          {conversa.clientes?.ia_bloqueada && (
            <Ban size={12} className="shrink-0 text-red-500 dark:text-red-400" aria-label="IA bloqueada" />
          )}
          {conversa.clientes?.origem_chat === "instagram" ? (
            <Camera size={12} className="shrink-0 text-fuchsia-500 dark:text-fuchsia-400" />
          ) : (
            <MessageSquare size={12} className="shrink-0 text-emerald-500 dark:text-emerald-400" />
          )}
          <Badge
            variant={STATUS_VARIANT[conversa.status]}
            className="text-[10px]"
            comBolinha
            pulsando={conversa.status === "aguardando_humano"}
          >
            {STATUS_LABEL[conversa.status]}
          </Badge>
          {classificacao.valor !== "aberta" && (
            <Badge variant={classificacao.variante} className="text-[10px]">
              {classificacao.curto}
            </Badge>
          )}
          {naoLidas > 0 && (
            <span
              className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white"
              aria-label={`${naoLidas} não lidas`}
            >
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
});

const ICONE_MIDIA = { imagem: ImageIcon, audio: Mic, documento: FileText } as const;
const LABEL_MIDIA = { imagem: "Foto", audio: "Áudio", documento: "Documento" } as const;
const PREFIXO_REMETENTE = { cliente: "", ia: "IA: ", funcionaria: "Você: " } as const;

/**
 * Começo da última mensagem, como no WhatsApp Web. Em foto/áudio/documento
 * mostra só o tipo — o texto guardado nessas mensagens é a descrição/transcrição
 * que a IA usa, que também não aparece pra equipe dentro da conversa.
 * Sem a migração 20261024_chat_previa_ultima_mensagem.sql não mostra nada.
 */
function PreviaUltimaMensagem({ conversa, destaque }: { conversa: ConversaDaLista; destaque: boolean }) {
  const tipo = conversa.ultima_mensagem_tipo ?? "texto";
  if (!conversa.ultima_mensagem && tipo === "texto") return null;
  const prefixo = PREFIXO_REMETENTE[conversa.ultima_mensagem_remetente ?? "cliente"];
  const Icone = tipo !== "texto" ? ICONE_MIDIA[tipo] : null;

  return (
    <p
      className={cn(
        "mt-0.5 flex items-center gap-1 truncate text-xs",
        destaque ? "font-medium text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"
      )}
    >
      {prefixo && <span className="shrink-0">{prefixo}</span>}
      {Icone && <Icone size={12} className="shrink-0" />}
      <span className="truncate">{Icone ? LABEL_MIDIA[tipo as keyof typeof LABEL_MIDIA] : conversa.ultima_mensagem}</span>
    </p>
  );
}
