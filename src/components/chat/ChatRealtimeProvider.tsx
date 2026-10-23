"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CHAVE_CONVERSAS,
  buscarConversa,
  buscarConversas,
  ordenarConversas,
  type ConversaDaLista,
} from "@/lib/chat/conversas";
import { Spinner } from "@/components/ui/Spinner";
import type { Conversa, Mensagem } from "@/types/database";

/**
 * Tempo real do Chat ao vivo, num lugar só (montado no layout do painel, então
 * vale em qualquer tela):
 * - UM canal do Supabase Realtime escutando `conversas` e `mensagens`;
 * - os eventos atualizam o cache da lista de conversas direto (sem
 *   router.refresh, que refazia a página inteira no servidor a cada evento);
 * - total de conversas com mensagem não lida (menu e título da aba);
 * - zera as não lidas da conversa aberta quando chega mensagem nela;
 * - aviso "Reconectando…" e ressincronização ao voltar: a lista é buscada de
 *   novo e as conversas abertas buscam as mensagens que se perderam.
 */

export type EventoChat =
  | { tipo: "mensagem"; mensagem: Mensagem }
  // Conexão voltou (ou a aba ficou parada um tempo): busque o que pode ter se perdido.
  | { tipo: "ressincronizar" };

type ContextoChat = {
  conectado: boolean;
  /** Quantas conversas têm mensagem do cliente ainda não aberta. */
  conversasNaoLidas: number;
  /** Escuta os eventos ao vivo. Devolve a função que cancela a escuta. */
  assinar: (ouvinte: (evento: EventoChat) => void) => () => void;
};

const ChatRealtimeContext = createContext<ContextoChat>({
  conectado: true,
  conversasNaoLidas: 0,
  assinar: () => () => {},
});

export function useChatRealtime() {
  return useContext(ChatRealtimeContext);
}

/** Lista de conversas (cache compartilhado, mantido em dia pelo Realtime). */
export function useConversas() {
  return useQuery({ queryKey: CHAVE_CONVERSAS, queryFn: () => buscarConversas(createClient()) });
}

// Aba escondida por mais que isso: ao voltar, ressincroniza por garantia — o
// navegador desacelera abas em segundo plano e a conexão pode ter caído calada.
const RESSINCRONIZAR_APOS_MS = 60_000;
// Canal fora do ar por mais que isso: derruba e cria de novo, em vez de
// esperar o reenvio automático do Supabase.
const RECRIAR_CANAL_APOS_MS = 20_000;
// Só mostra o aviso se a queda durar mais que isso (evita piscar à toa).
const MOSTRAR_AVISO_APOS_MS = 3_000;

export function ChatRealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const conversaAbertaId = pathname.match(/^\/chat\/([^/]+)/)?.[1] ?? null;
  const conversaAbertaRef = useRef(conversaAbertaId);
  conversaAbertaRef.current = conversaAbertaId;

  const { data: conversas } = useConversas();
  const [conectado, setConectado] = useState(false);
  const [online, setOnline] = useState(true);
  const [geracaoCanal, setGeracaoCanal] = useState(0);
  const jaConectouRef = useRef(false);
  const ouvintesRef = useRef(new Set<(evento: EventoChat) => void>());

  const emitir = useCallback((evento: EventoChat) => {
    ouvintesRef.current.forEach((ouvinte) => ouvinte(evento));
  }, []);

  const assinar = useCallback((ouvinte: (evento: EventoChat) => void) => {
    ouvintesRef.current.add(ouvinte);
    return () => {
      ouvintesRef.current.delete(ouvinte);
    };
  }, []);

  const ressincronizar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CHAVE_CONVERSAS });
    emitir({ tipo: "ressincronizar" });
  }, [queryClient, emitir]);

  // Abrir a conversa = ler as mensagens. Zera primeiro no cache (a bolinha
  // some na hora) e depois no banco. Mudar só nao_lidas não muda a ordem da
  // lista (ver a migração 20261023_chat_classificacao_e_nao_lidas.sql).
  const zerarNaoLidas = useCallback(
    async (id: string) => {
      // Já está zerada no cache: nem chama o banco (isto roda a cada volta pra aba).
      const naLista = queryClient.getQueryData<ConversaDaLista[]>(CHAVE_CONVERSAS)?.find((c) => c.id === id);
      if (naLista && naLista.nao_lidas === 0) return;
      queryClient.setQueryData<ConversaDaLista[]>(CHAVE_CONVERSAS, (lista) =>
        lista?.map((c) => (c.id === id && c.nao_lidas > 0 ? { ...c, nao_lidas: 0 } : c))
      );
      await supabase.from("conversas").update({ nao_lidas: 0 }).eq("id", id).gt("nao_lidas", 0);
    },
    [queryClient, supabase]
  );

  const aplicarMudancaConversa = useCallback(
    (evento: "INSERT" | "UPDATE" | "DELETE", nova: Partial<Conversa>, antiga: Partial<Conversa>) => {
      if (evento === "DELETE") {
        // Ex.: "Mesclar conversas" remove as duplicadas.
        queryClient.setQueryData<ConversaDaLista[]>(CHAVE_CONVERSAS, (lista) => lista?.filter((c) => c.id !== antiga.id));
        return;
      }
      const id = nova.id;
      if (!id) return;
      const lista = queryClient.getQueryData<ConversaDaLista[]>(CHAVE_CONVERSAS);
      if (!lista) return; // lista ainda carregando — a consulta já vai trazer a versão nova

      if (lista.some((c) => c.id === id)) {
        // O evento traz a linha inteira da conversa (replica identity full),
        // mas não o cliente — mantém o que já estava no cache.
        queryClient.setQueryData<ConversaDaLista[]>(CHAVE_CONVERSAS, (atual) =>
          atual ? ordenarConversas(atual.map((c) => (c.id === id ? { ...c, ...nova, clientes: c.clientes } : c))) : atual
        );
      } else {
        // Conversa nova: busca junto o cliente (nome, foto, telefone).
        buscarConversa(supabase, id).then((conversa) => {
          if (!conversa) return;
          queryClient.setQueryData<ConversaDaLista[]>(CHAVE_CONVERSAS, (atual) =>
            atual && !atual.some((c) => c.id === conversa.id) ? ordenarConversas([conversa, ...atual]) : atual
          );
        });
      }

      // Mensagem nova na conversa que está aberta e visível: já está sendo lida.
      if (id === conversaAbertaRef.current && (nova.nao_lidas ?? 0) > 0 && document.visibilityState === "visible") {
        zerarNaoLidas(id);
      }
    },
    [queryClient, supabase, zerarNaoLidas]
  );

  // Canal único do Realtime. Recriado (geracaoCanal) se ficar muito tempo fora.
  useEffect(() => {
    let ativo = true;
    const canal = supabase
      .channel(`chat-ao-vivo-${geracaoCanal}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, (payload) => {
        aplicarMudancaConversa(payload.eventType, payload.new as Partial<Conversa>, payload.old as Partial<Conversa>);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (payload) => {
        emitir({ tipo: "mensagem", mensagem: payload.new as Mensagem });
      })
      .subscribe((status) => {
        if (!ativo) return;
        if (status === "SUBSCRIBED") {
          setConectado(true);
          // Voltou depois de uma queda: busca o que chegou enquanto estava fora.
          // Na primeira conexão, só se a lista já tinha sido carregada antes do
          // canal ficar pronto (o que chegou nesse meio-tempo não teve evento).
          if (jaConectouRef.current || queryClient.getQueryData(CHAVE_CONVERSAS)) ressincronizar();
          jaConectouRef.current = true;
        } else {
          setConectado(false);
        }
      });

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [supabase, queryClient, geracaoCanal, aplicarMudancaConversa, emitir, ressincronizar]);

  // Fora do ar por tempo demais: recria o canal.
  useEffect(() => {
    if (conectado) return;
    const t = setTimeout(() => setGeracaoCanal((g) => g + 1), RECRIAR_CANAL_APOS_MS);
    return () => clearTimeout(t);
  }, [conectado, geracaoCanal]);

  // Internet caiu/voltou.
  useEffect(() => {
    setOnline(navigator.onLine);
    const aoFicarOnline = () => {
      setOnline(true);
      setGeracaoCanal((g) => g + 1); // reconecta já, sem esperar o próximo reenvio
    };
    const aoFicarOffline = () => setOnline(false);
    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("offline", aoFicarOffline);
    return () => {
      window.removeEventListener("online", aoFicarOnline);
      window.removeEventListener("offline", aoFicarOffline);
    };
  }, []);

  // Aba volta a ficar visível: zera a conversa aberta e, se ficou muito tempo
  // escondida, ressincroniza.
  useEffect(() => {
    let escondidaEm: number | null = null;
    function aoMudarVisibilidade() {
      if (document.visibilityState === "hidden") {
        escondidaEm = Date.now();
        return;
      }
      if (conversaAbertaRef.current) zerarNaoLidas(conversaAbertaRef.current);
      if (escondidaEm && Date.now() - escondidaEm > RESSINCRONIZAR_APOS_MS) ressincronizar();
      escondidaEm = null;
    }
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  }, [zerarNaoLidas, ressincronizar]);

  // Abriu uma conversa: zera as não lidas dela.
  useEffect(() => {
    if (conversaAbertaId && document.visibilityState === "visible") zerarNaoLidas(conversaAbertaId);
  }, [conversaAbertaId, zerarNaoLidas]);

  const conversasNaoLidas = useMemo(() => (conversas ?? []).filter((c) => c.nao_lidas > 0).length, [conversas]);

  // Título da aba: "(3) CRM Farmácia Preço Bom". Reaplicado a cada troca de
  // página porque o Next reescreve o título na navegação.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = conversasNaoLidas > 0 ? `(${conversasNaoLidas > 99 ? "99+" : conversasNaoLidas}) ${base}` : base;
  }, [conversasNaoLidas, pathname]);

  const valor = useMemo(
    () => ({ conectado, conversasNaoLidas, assinar }),
    [conectado, conversasNaoLidas, assinar]
  );

  return (
    <ChatRealtimeContext.Provider value={valor}>
      {children}
      <AvisoConexao conectado={conectado && online} online={online} />
    </ChatRealtimeContext.Provider>
  );
}

/** Aviso discreto no rodapé enquanto a conexão ao vivo estiver fora. */
function AvisoConexao({ conectado, online }: { conectado: boolean; online: boolean }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (conectado) {
      setVisivel(false);
      return;
    }
    const t = setTimeout(() => setVisivel(true), MOSTRAR_AVISO_APOS_MS);
    return () => clearTimeout(t);
  }, [conectado]);

  if (!visivel) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-100 px-3.5 py-1.5 text-xs font-semibold text-amber-800 shadow-card-md ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-400/30 md:bottom-5"
    >
      {online ? <Spinner size={13} className="text-amber-600 dark:text-amber-300" /> : <WifiOff size={13} />}
      {online ? "Reconectando…" : "Sem internet — reconectando quando voltar…"}
    </div>
  );
}
