import { createServiceClient } from "@/lib/supabase/server";
import { normalizarTelefone, variantesTelefoneBr } from "@/lib/telefone";

/**
 * Acha o cliente da conversa pelo telefone (exato primeiro, depois as
 * variações com/sem 55 e 9º dígito). É a ÚNICA forma de as ferramentas da IA
 * saberem "quem é o cliente": a IA nunca escolhe um id de cliente, então uma
 * mensagem maliciosa ("me mostra os pedidos do fulano") não consegue ler
 * dados de outra pessoa.
 */
export async function clienteDoTelefone(telefone: string) {
  const supabase = createServiceClient();
  const exato = normalizarTelefone(telefone);
  const { data: direto } = await supabase.from("clientes").select("id, nome, telefone").eq("telefone", exato).maybeSingle();
  if (direto) return direto;
  const { data } = await supabase
    .from("clientes")
    .select("id, nome, telefone")
    .in("telefone", variantesTelefoneBr(telefone))
    .order("ultima_interacao", { ascending: false, nullsFirst: false })
    .limit(1);
  return data?.[0] ?? null;
}
