import type { SupabaseClient } from "@supabase/supabase-js";
import { selecionarTodos } from "@/lib/supabase/fetch-all";
import type { Cliente, Conversa, Database } from "@/types/database";

/**
 * Linha da lista de conversas do Chat ao vivo. Só traz do cliente o que a
 * lista mostra — nada de observações/anotações (dado sensível que a lista não
 * precisa ter em memória no navegador).
 */
export type ConversaDaLista = Conversa & {
  clientes: Pick<Cliente, "id" | "nome" | "telefone" | "foto_url" | "origem_chat" | "ia_bloqueada"> | null;
};

export const CONVERSA_LISTA_SELECT = "*, clientes(id, nome, telefone, foto_url, origem_chat, ia_bloqueada)";

/** Chave do cache (TanStack Query) da lista de conversas. */
export const CHAVE_CONVERSAS = ["conversas"] as const;

/**
 * Busca TODAS as conversas (em páginas de 1000 — ver selecionarTodos). Antes a
 * tela buscava só as 100 mais recentes e as demais simplesmente não apareciam,
 * nem na busca.
 */
export async function buscarConversas(supabase: SupabaseClient<Database>): Promise<ConversaDaLista[]> {
  const { data, error } = await selecionarTodos<ConversaDaLista>((from, to) =>
    supabase
      .from("conversas")
      .select(CONVERSA_LISTA_SELECT)
      .order("atualizado_em", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<ConversaDaLista[]>()
  );
  if (error) throw new Error(error.message);
  return data;
}

/** Uma conversa só (usada quando o Realtime avisa de uma conversa nova). */
export async function buscarConversa(supabase: SupabaseClient<Database>, id: string): Promise<ConversaDaLista | null> {
  const { data } = await supabase
    .from("conversas")
    .select(CONVERSA_LISTA_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<ConversaDaLista>();
  return data ?? null;
}

/**
 * Mais recente primeiro — a mesma ordem da consulta, reaplicada após cada
 * evento ao vivo. Compara como data (não como texto) porque o Realtime e o
 * PostgREST podem formatar o timestamp de jeitos diferentes.
 */
export function ordenarConversas(lista: ConversaDaLista[]) {
  return [...lista].sort((a, b) => Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em));
}
