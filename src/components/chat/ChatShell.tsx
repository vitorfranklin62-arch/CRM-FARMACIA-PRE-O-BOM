"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationList } from "./ConversationList";
import { MesclarConversasButton } from "./MesclarConversasButton";
import { NovaConversaButton } from "./NovaConversaButton";
import { useChatRealtime, useConversas } from "./ChatRealtimeProvider";

/**
 * Modo "expandido" da conversa: o chat ocupa a tela toda (some a lista de
 * conversas e o menu do painel). O botão fica no cabeçalho da conversa
 * (MessageThread), que lê/troca este estado pelo contexto.
 */
const ExpandidoContext = createContext<{ expandido: boolean; alternar: () => void }>({
  expandido: false,
  alternar: () => {},
});

export function useChatExpandido() {
  return useContext(ExpandidoContext);
}

const CHAVE_EXPANDIDO = "chat:expandido";

/**
 * Moldura do Chat ao vivo (fica no layout de /chat): lista de conversas à
 * esquerda e a conversa aberta (children) à direita. A lista vem do cache
 * mantido ao vivo pelo ChatRealtimeProvider.
 */
export function ChatShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const selectedId = params?.id;
  const [expandido, setExpandido] = useState(false);
  const { data: conversas, isPending, isError, refetch } = useConversas();
  const { conversasNaoLidas: naoLidas } = useChatRealtime();

  // Quantas conversas estão esperando alguém da farmácia responder.
  const aguardando = (conversas ?? []).filter((c) => c.status === "aguardando_humano").length;

  // Lembra se estava expandido ao trocar de conversa (cada conversa é uma página).
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE_EXPANDIDO) === "1") setExpandido(true);
    } catch {
      // Sem localStorage: começa recolhido.
    }
  }, []);

  const alternar = useCallback(() => {
    setExpandido((atual) => {
      try {
        localStorage.setItem(CHAVE_EXPANDIDO, atual ? "0" : "1");
      } catch {
        // idem
      }
      return !atual;
    });
  }, []);

  // Esc recolhe, como fechar um modal.
  useEffect(() => {
    if (!expandido) return;
    function onKeyDown(e: KeyboardEvent) {
      // Com um modal aberto (ex.: Nova conversa), o Esc é dele — não recolhe o chat junto.
      if (e.key === "Escape" && !document.querySelector(".fixed.inset-0.z-50")) alternar();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expandido, alternar]);

  const modoExpandido = expandido && !!selectedId;

  return (
    <ExpandidoContext.Provider value={{ expandido: modoExpandido, alternar }}>
      <div
        className={cn(
          "relative flex overflow-hidden border border-white/60 bg-white/85 shadow-card-md backdrop-blur-sm dark:border-white/10 dark:bg-navy-800/60",
          modoExpandido
            ? "fixed inset-0 z-40 h-auto rounded-none bg-white dark:bg-navy-900 md:inset-3 md:rounded-2xl"
            : "h-[calc(100vh-15rem)] rounded-2xl md:h-[calc(100vh-13.5rem)]"
        )}
      >
        <span aria-hidden className="faixa-arcoiris absolute inset-x-0 top-0 z-10 h-1" />

        <div
          className={cn(
            "w-full max-w-xs shrink-0 flex-col border-r border-brand-100/70 bg-gradient-to-b from-brand-50/60 to-transparent dark:border-white/10 dark:from-brand-500/10",
            modoExpandido ? "hidden" : selectedId ? "hidden md:flex" : "flex"
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-brand-100/70 px-4 pb-3.5 pt-4 dark:border-white/10">
            <div className="min-w-0">
              <h2 className="titulo-gradiente text-sm font-bold">Conversas</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {aguardando > 0 ? (
                  <span className="font-semibold text-accent-600 dark:text-accent-300">{aguardando} esperando você</span>
                ) : naoLidas > 0 ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{naoLidas} com mensagem nova</span>
                ) : (
                  "tudo em dia por aqui"
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <NovaConversaButton />
              <MesclarConversasButton />
            </div>
          </div>
          <ConversationList
            conversas={conversas}
            carregando={isPending}
            erro={isError}
            onTentarDeNovo={() => refetch()}
            selectedId={selectedId}
          />
        </div>

        <div className={cn("min-w-0 flex-1 md:flex md:flex-col", selectedId ? "flex flex-col" : "hidden")}>
          {children}
        </div>
      </div>
    </ExpandidoContext.Provider>
  );
}
