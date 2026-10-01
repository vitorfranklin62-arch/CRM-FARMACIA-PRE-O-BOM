import { createServiceClient } from "@/lib/supabase/server";
import type { TipoMidia } from "@/lib/chat-midia-tipos";

/**
 * Chama um webhook do N8N cuja URL a dona cadastrou em Configurações →
 * Integrações (guardada em `configuracoes.<chave>`). Best-effort: sem URL,
 * sem N8N_WEBHOOK_SECRET ou com o N8N fora do ar, simplesmente não faz nada —
 * a ação principal que disparou a chamada (mensagem salva, campanha
 * agendada, status trocado) nunca deve falhar por causa dele.
 */
export async function chamarWebhookN8n(chave: string, payload: unknown): Promise<void> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return;

  try {
    const { data: config } = await createServiceClient()
      .from("configuracoes")
      .select("valor")
      .eq("chave", chave)
      .maybeSingle();

    const url = config?.valor;
    if (!url) return;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
    });
  } catch {
    // best-effort — ver comentário acima
  }
}

/**
 * Entrega uma mensagem do Chat pelo N8N (que envia via UAIZAP/WhatsApp).
 * Sem `midia` vai só o texto. Com `midia`, o N8N baixa o arquivo pelo link
 * assinado e manda como foto, PDF ou mensagem de voz — a `legenda` é o texto
 * que acompanha a foto/PDF (o áudio não aceita legenda no WhatsApp).
 */
export function notificarMensagemChat(dados: {
  conversaId: string;
  mensagemId: string;
  conteudo: string;
  cliente: { nome: string | null; telefone: string | null };
  midia?: { tipo: TipoMidia; url: string; nome: string | null; mime: string; legenda: string };
}): Promise<void> {
  return chamarWebhookN8n("integracao_n8n_chat_webhook_url", {
    conversa_id: dados.conversaId,
    mensagem_id: dados.mensagemId,
    conteudo: dados.conteudo,
    cliente: dados.cliente,
    tipo: dados.midia?.tipo ?? "texto",
    legenda: dados.midia?.legenda ?? "",
    midia_url: dados.midia?.url ?? "",
    midia_nome: dados.midia?.nome ?? "",
    midia_mime: dados.midia?.mime ?? "",
  });
}
