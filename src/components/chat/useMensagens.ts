"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChatRealtime } from "./ChatRealtimeProvider";
import type { MensagemComUsuario } from "@/types/relations";

/** O que está carregado de uma conversa: as mensagens (em ordem) e se há mais antigas no banco. */
type JanelaMensagens = { mensagens: MensagemComUsuario[]; temMaisAntigas: boolean };

const chaveMensagens = (conversaId: string) => ["mensagens", conversaId] as const;

async function buscarMensagens(conversaId: string, cursor: { antes?: string; depois?: string } = {}) {
  const params = new URLSearchParams({ conversa_id: conversaId });
  if (cursor.antes) params.set("antes", cursor.antes);
  if (cursor.depois) params.set("depois", cursor.depois);
  const res = await fetch(`/api/chat/mensagens?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Não foi possível carregar as mensagens.");
  return (await res.json()) as JanelaMensagens;
}

/** Junta duas listas sem repetir (a versão nova de uma mensagem vence) e ordena por data. */
function mesclar(atuais: MensagemComUsuario[], novas: MensagemComUsuario[]) {
  const porId = new Map(atuais.map((m) => [m.id, m]));
  for (const m of novas) porId.set(m.id, m);
  return Array.from(porId.values()).sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em));
}

/**
 * Mensagens de uma conversa do Chat ao vivo, com cache por conversa (voltar
 * pra uma conversa já aberta é instantâneo).
 *
 * - Abre com as últimas 40; `carregarAntigas` traz as 40 anteriores.
 * - Mensagem nova (Realtime) → busca só o que veio depois da última que está
 *   na tela, já com o nome de quem enviou e o link da mídia.
 * - Conexão voltou / aba ficou parada → mesma busca, recuperando o que se perdeu.
 */
export function useMensagens(conversaId: string) {
  const queryClient = useQueryClient();
  const { assinar } = useChatRealtime();
  const chave = chaveMensagens(conversaId);

  const query = useQuery({
    queryKey: chave,
    queryFn: () => buscarMensagens(conversaId),
    gcTime: 30 * 60_000,
  });

  const emAndamentoRef = useRef<Promise<void> | null>(null);
  const pendenteRef = useRef(false);

  // Busca o que chegou depois da última mensagem carregada. Várias chamadas
  // seguidas (rajada de eventos) viram no máximo uma em andamento + uma depois.
  const sincronizar = useCallback(() => {
    if (emAndamentoRef.current) {
      pendenteRef.current = true;
      return;
    }
    const chaveAtual = chaveMensagens(conversaId);
    const rodar = async () => {
      do {
        pendenteRef.current = false;
        const ultima = queryClient.getQueryData<JanelaMensagens>(chaveAtual)?.mensagens.at(-1);
        if (!ultima) {
          // Nada carregado ainda (ou conversa vazia): busca a página inicial de novo.
          await queryClient.invalidateQueries({ queryKey: chaveAtual });
          return;
        }
        try {
          const { mensagens } = await buscarMensagens(conversaId, { depois: ultima.criado_em });
          queryClient.setQueryData<JanelaMensagens>(chaveAtual, (janela) =>
            janela ? { ...janela, mensagens: mesclar(janela.mensagens, mensagens) } : janela
          );
        } catch {
          // Sem conexão agora — a próxima mensagem ou a reconexão tentam de novo.
        }
      } while (pendenteRef.current);
    };
    emAndamentoRef.current = rodar().finally(() => {
      emAndamentoRef.current = null;
    });
  }, [conversaId, queryClient]);

  // Eventos ao vivo desta conversa.
  useEffect(() => {
    return assinar((evento) => {
      if (evento.tipo === "ressincronizar" || evento.mensagem.conversa_id === conversaId) sincronizar();
    });
  }, [assinar, conversaId, sincronizar]);

  // Voltando pra uma conversa que já estava no cache: busca o que chegou
  // enquanto ela estava fechada (a escuta acima só vale com ela aberta).
  useEffect(() => {
    if (queryClient.getQueryData(chaveMensagens(conversaId))) sincronizar();
  }, [conversaId, queryClient, sincronizar]);

  const [carregandoAntigas, setCarregandoAntigas] = useState(false);

  const carregarAntigas = useCallback(async () => {
    const janela = queryClient.getQueryData<JanelaMensagens>(chaveMensagens(conversaId));
    const primeira = janela?.mensagens[0];
    if (carregandoAntigas || !janela?.temMaisAntigas || !primeira) return;
    setCarregandoAntigas(true);
    try {
      const anteriores = await buscarMensagens(conversaId, { antes: primeira.criado_em });
      queryClient.setQueryData<JanelaMensagens>(chaveMensagens(conversaId), (atual) =>
        atual ? { mensagens: mesclar(atual.mensagens, anteriores.mensagens), temMaisAntigas: anteriores.temMaisAntigas } : atual
      );
    } catch {
      // Falhou: o usuário pode rolar pra cima de novo pra tentar.
    } finally {
      setCarregandoAntigas(false);
    }
  }, [carregandoAntigas, conversaId, queryClient]);

  // Links de mídia expiram (6h): busca de novo tudo o que está carregado, com links novos.
  const renovarLinks = useCallback(async () => {
    const primeira = queryClient.getQueryData<JanelaMensagens>(chaveMensagens(conversaId))?.mensagens[0];
    if (!primeira) return;
    try {
      const { mensagens } = await buscarMensagens(conversaId, { depois: primeira.criado_em });
      queryClient.setQueryData<JanelaMensagens>(chaveMensagens(conversaId), (janela) =>
        janela ? { ...janela, mensagens: mesclar(janela.mensagens, mensagens) } : janela
      );
    } catch {
      // O componente de mídia mostra o erro depois do tempo limite.
    }
  }, [conversaId, queryClient]);

  return {
    mensagens: query.data?.mensagens ?? [],
    carregando: query.isPending,
    erro: query.isError,
    tentarDeNovo: query.refetch,
    temMaisAntigas: query.data?.temMaisAntigas ?? false,
    carregandoAntigas,
    carregarAntigas,
    sincronizar,
    renovarLinks,
  };
}
