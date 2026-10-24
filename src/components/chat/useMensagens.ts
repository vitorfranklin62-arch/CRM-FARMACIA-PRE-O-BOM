"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChatRealtime } from "./ChatRealtimeProvider";
import type { MensagemComUsuario } from "@/types/relations";

/**
 * Mensagem como aparece na tela. As enviadas pelo painel entram na hora, antes
 * da resposta do servidor (`_local`), com o estado do envio em `_envio`. Quando
 * a versão do banco chega (mesmo id), ela substitui a local e os campos somem.
 */
export type MensagemNaTela = MensagemComUsuario & { _local?: true; _envio?: "enviando" | "erro" };

/** O que está carregado de uma conversa: as mensagens (em ordem) e se há mais antigas no banco. */
type JanelaMensagens = { mensagens: MensagemNaTela[]; temMaisAntigas: boolean };

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
function mesclar(atuais: MensagemNaTela[], novas: MensagemNaTela[]) {
  const porId = new Map(atuais.map((m) => [m.id, m]));
  for (const m of novas) porId.set(m.id, m);
  return Array.from(porId.values()).sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em));
}

/**
 * Última mensagem que já veio do banco — é dela que sai o cursor "depois de".
 * As locais ficam de fora: a data delas é do relógio deste computador, que
 * pode estar adiantado e fazer a busca pular mensagens.
 */
function ultimaDoBanco(mensagens: MensagemNaTela[]) {
  for (let i = mensagens.length - 1; i >= 0; i--) if (!mensagens[i]._local) return mensagens[i];
  return undefined;
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
        const janela = queryClient.getQueryData<JanelaMensagens>(chaveAtual);
        if (!janela) {
          // Primeira carga ainda em andamento: busca de novo, já com o que acabou de chegar.
          await queryClient.invalidateQueries({ queryKey: chaveAtual });
          return;
        }
        const ultima = ultimaDoBanco(janela.mensagens);
        try {
          // Sem nenhuma mensagem do banco ainda (conversa nova): busca a página inicial.
          const { mensagens } = await buscarMensagens(conversaId, ultima ? { depois: ultima.criado_em } : {});
          queryClient.setQueryData<JanelaMensagens>(chaveAtual, (atual) =>
            atual ? { ...atual, mensagens: mesclar(atual.mensagens, mensagens) } : atual
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

  // ---- Envio otimista ----------------------------------------------------

  const mudarMensagem = useCallback(
    (id: string, mudar: (m: MensagemNaTela, todas: MensagemNaTela[]) => MensagemNaTela[] | MensagemNaTela) => {
      queryClient.setQueryData<JanelaMensagens>(chaveMensagens(conversaId), (janela) => {
        if (!janela) return janela;
        const alvo = janela.mensagens.find((m) => m.id === id);
        if (!alvo) return janela;
        const resultado = mudar(alvo, janela.mensagens);
        return {
          ...janela,
          mensagens: Array.isArray(resultado) ? resultado : janela.mensagens.map((m) => (m.id === id ? resultado : m)),
        };
      });
    },
    [conversaId, queryClient]
  );

  const tentarEnvio = useCallback(
    async (idLocal: string, conteudo: string) => {
      mudarMensagem(idLocal, (m) => ({ ...m, _envio: "enviando" }));
      try {
        const res = await fetch("/api/chat/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversa_id: conversaId, conteudo }),
        });
        if (!res.ok) throw new Error();
        const { id } = (await res.json()) as { id: string };
        // Salva no banco: a local passa a ter o id de verdade. Se o Realtime já
        // trouxe a versão do banco antes desta resposta, só some com a local.
        mudarMensagem(idLocal, (m, todas) =>
          todas.some((outra) => outra.id === id)
            ? todas.filter((outra) => outra.id !== idLocal)
            : { ...m, id, _envio: undefined }
        );
        sincronizar();
      } catch {
        mudarMensagem(idLocal, (m) => ({ ...m, _envio: "erro" }));
      }
    },
    [conversaId, mudarMensagem, sincronizar]
  );

  /** Mostra a mensagem na hora e envia em seguida. */
  const enviarTexto = useCallback(
    (conteudo: string) => {
      const local: MensagemNaTela = {
        id: `local-${crypto.randomUUID()}`,
        conversa_id: conversaId,
        remetente: "funcionaria",
        usuario_id: null,
        usuarios: null,
        conteudo,
        tipo: "texto",
        midia_path: null,
        midia_nome: null,
        midia_mime: null,
        criado_em: new Date().toISOString(),
        _local: true,
        _envio: "enviando",
      };
      queryClient.setQueryData<JanelaMensagens>(chaveMensagens(conversaId), (janela) => ({
        temMaisAntigas: janela?.temMaisAntigas ?? false,
        mensagens: mesclar(janela?.mensagens ?? [], [local]),
      }));
      tentarEnvio(local.id, conteudo);
    },
    [conversaId, queryClient, tentarEnvio]
  );

  /** Botão "Tentar novamente" de uma mensagem que falhou. */
  const reenviar = useCallback(
    (idLocal: string) => {
      const msg = queryClient
        .getQueryData<JanelaMensagens>(chaveMensagens(conversaId))
        ?.mensagens.find((m) => m.id === idLocal);
      if (msg?._envio === "erro") tentarEnvio(idLocal, msg.conteudo);
    },
    [conversaId, queryClient, tentarEnvio]
  );

  /** Tira da tela uma mensagem que falhou e a pessoa desistiu de enviar. */
  const descartar = useCallback(
    (idLocal: string) => mudarMensagem(idLocal, (_m, todas) => todas.filter((m) => m.id !== idLocal)),
    [mudarMensagem]
  );

  return {
    mensagens: query.data?.mensagens ?? [],
    enviarTexto,
    reenviar,
    descartar,
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
