import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefone } from "@/lib/telefone";
import type { Database } from "@/types/database";

type ResultadoCliente =
  | { clienteId: string; resposta?: never }
  | { clienteId?: never; resposta: NextResponse };

/**
 * Resolve o cliente de um webhook do N8N (pedido, mensagem ou cliente): se o
 * chamador mandou `id`, atualiza direto sem tocar no telefone; senão faz um
 * upsert atômico por telefone (trava `clientes_telefone_key` no banco) —
 * evita a corrida em que duas chamadas quase simultâneas pro mesmo número
 * cada uma achava "cliente não existe" e criava um duplicado. `foto_url` só
 * entra quando vier preenchida, pra uma chamada sem foto não apagar a que já
 * existia.
 */
export async function registrarClienteWebhook(
  supabase: SupabaseClient<Database>,
  cliente: {
    id?: string | null;
    nome: string;
    telefone: string;
    origem_chat?: "whatsapp" | "instagram" | null;
    foto_url?: string | null;
  },
  agora: string
): Promise<ResultadoCliente> {
  const dados = {
    nome: cliente.nome,
    origem_chat: cliente.origem_chat ?? null,
    ultima_interacao: agora,
    ...(cliente.foto_url ? { foto_url: cliente.foto_url } : {}),
  };

  if (cliente.id) {
    await supabase.from("clientes").update(dados).eq("id", cliente.id);
    return { clienteId: cliente.id };
  }

  const { data, error } = await supabase
    .from("clientes")
    .upsert({ ...dados, telefone: normalizarTelefone(cliente.telefone) }, { onConflict: "telefone" })
    .select("id")
    .single();

  if (error || !data) {
    return {
      resposta: NextResponse.json(
        { error: "Não foi possível registrar o cliente.", detalhe: error?.message ?? null },
        { status: 500 }
      ),
    };
  }

  return { clienteId: data.id };
}
