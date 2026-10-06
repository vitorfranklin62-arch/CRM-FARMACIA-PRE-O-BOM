import { createServiceClient } from "@/lib/supabase/server";
import { normalizarTelefone } from "@/lib/telefone";

/**
 * Palavras que o cliente manda pra sair das campanhas. Só vale a mensagem
 * INTEIRA (depois de tirar acento, pontuação e caixa) — assim "preciso sair
 * mais cedo" ou "pode parar na farmácia?" nunca descadastram ninguém.
 * "cancelar" fica de fora de propósito: é o que o cliente diz pra cancelar uma
 * encomenda.
 */
const PALAVRAS_OPTOUT = new Set([
  "sair",
  "parar",
  "pare",
  "descadastrar",
  "descadastro",
  "stop",
  "nao quero receber",
  "nao quero mais receber",
  "nao quero receber mensagens",
  "remover",
]);

export function pedidoDeOptout(texto: string): boolean {
  const limpo = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return PALAVRAS_OPTOUT.has(limpo);
}

const CONFIRMACAO =
  "Pronto, você não vai mais receber nossas campanhas. Se mudar de ideia, é só nos chamar por aqui. 🙂";

/**
 * Marca o cliente como "não quer campanha" e manda uma confirmação pelo
 * WhatsApp. Idempotente: se já estava descadastrado, não grava de novo nem
 * confirma de novo (evita loop de "SAIR" repetido gerar spam).
 * A confirmação é best-effort — o descadastro já está gravado de qualquer jeito.
 */
export async function registrarOptout(clienteId: string, telefone: string): Promise<{ novo: boolean }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("clientes")
    .update({ aceita_campanhas: false, optout_em: new Date().toISOString() })
    .eq("id", clienteId)
    .eq("aceita_campanhas", true)
    .select("id");

  if (error) throw error;
  const novo = (data?.length ?? 0) > 0;
  if (novo) await enviarConfirmacao(telefone);
  return { novo };
}

async function enviarConfirmacao(telefone: string) {
  const baseUrl = process.env.UAIZAP_BASE_URL;
  const apiKey = process.env.UAIZAP_API_KEY;
  if (!baseUrl || !apiKey) return;

  try {
    await fetch(`${baseUrl.replace(/\/$/, "")}/send/text`, {
      method: "POST",
      headers: { token: apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ number: normalizarTelefone(telefone), text: CONFIRMACAO, delay: 2000 }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Best-effort: o descadastro já foi gravado.
  }
}
