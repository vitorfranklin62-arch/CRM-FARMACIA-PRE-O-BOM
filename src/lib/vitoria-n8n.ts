import { createServiceClient } from "@/lib/supabase/server";

/** Caminho do webhook da Vitória AI no N8N (fluxo "Vitória AI (consulta interna da equipe)"). */
const CAMINHO_WEBHOOK_VITORIA = "/webhook/VITORIA-AI-CONSULTA-FARMACIA";
const TIMEOUT_MS = 45_000;

/** Erro esperado ao falar com o N8N (config ausente, recusa, resposta vazia). */
export class VitoriaN8nError extends Error {}

/**
 * Descobre a URL do webhook da Vitória no N8N. Ordem:
 *  1. variável de ambiente N8N_VITORIA_WEBHOOK_URL (se existir);
 *  2. o mesmo servidor N8N do webhook de chat já cadastrado em
 *     Configurações → Integrações (`integracao_n8n_chat_webhook_url`).
 */
async function urlDoWebhook(): Promise<string> {
  const doAmbiente = process.env.N8N_VITORIA_WEBHOOK_URL?.trim();
  if (doAmbiente) return doAmbiente;

  const { data } = await createServiceClient()
    .from("configuracoes")
    .select("valor")
    .eq("chave", "integracao_n8n_chat_webhook_url")
    .maybeSingle();

  try {
    return new URL(CAMINHO_WEBHOOK_VITORIA, data?.valor ?? "").toString();
  } catch {
    throw new VitoriaN8nError("Webhook do N8N não configurado (Configurações → Integrações).");
  }
}

/**
 * Pergunta pra Vitória AI via N8N. O prompt (padrão ou o personalizado em
 * Configurações → Vitória AI) vai junto na chamada; o fluxo do N8N só
 * repassa pro modelo. Nenhuma chave de IA fica no CRM — ela mora na
 * credencial do N8N.
 */
export async function perguntarVitoriaN8n(pergunta: string, prompt: string): Promise<string> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) throw new VitoriaN8nError("N8N_WEBHOOK_SECRET não configurado no servidor.");

  const url = await urlDoWebhook();

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ pergunta, prompt }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new VitoriaN8nError("A Vitória AI demorou demais para responder. Tente de novo.");
  }

  if (!resposta.ok) {
    throw new VitoriaN8nError(
      resposta.status === 404
        ? "O fluxo da Vitória AI não está ativo no N8N."
        : "A Vitória AI não conseguiu responder agora. Tente de novo."
    );
  }

  const corpo = (await resposta.json().catch(() => null)) as { resposta?: unknown } | null;
  const texto = typeof corpo?.resposta === "string" ? corpo.resposta.trim() : "";
  if (!texto) throw new VitoriaN8nError("A Vitória AI não retornou uma resposta.");
  return texto;
}
