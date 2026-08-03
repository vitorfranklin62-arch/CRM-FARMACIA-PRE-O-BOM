import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { mensagemCreateSchema } from "@/lib/validation";

/**
 * POST /api/chat/enviar
 * Chamado pelo painel quando uma funcionária/dona responde no Chat ao vivo.
 * Salva a mensagem no Supabase e notifica o N8N para entregar via UAIZAP/WhatsApp.
 */
export async function POST(request: Request) {
  const usuario = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = mensagemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { conversa_id, conteudo } = parsed.data;
  const supabase = await createClient();

  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id, clientes(nome, telefone)")
    .eq("id", conversa_id)
    .single();

  if (conversaError || !conversa) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({ conversa_id, remetente: "funcionaria", usuario_id: usuario.id, conteudo })
    .select("id")
    .single();

  if (mensagemError || !mensagem) {
    return NextResponse.json({ error: "Não foi possível registrar a mensagem." }, { status: 500 });
  }

  // Uma funcionária respondendo manualmente pelo CRM é sinal de que um humano
  // já está cuidando da conversa — marca "aguardando_humano" pra IA não
  // continuar respondendo por cima (mesmo efeito de quando alguém intervém
  // direto pelo WhatsApp do celular).
  await supabase
    .from("conversas")
    .update({ atualizado_em: new Date().toISOString(), status: "aguardando_humano" })
    .eq("id", conversa_id);

  // Notifica o N8N pra entregar a mensagem via UAIZAP/WhatsApp (best-effort — a mensagem já foi salva)
  const service = createServiceClient();
  const { data: config } = await service
    .from("configuracoes")
    .select("valor")
    .eq("chave", "integracao_n8n_chat_webhook_url")
    .maybeSingle();

  const webhookUrl = config?.valor;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const cliente = Array.isArray(conversa.clientes) ? conversa.clientes[0] : conversa.clientes;

  if (webhookUrl && secret) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          conversa_id,
          mensagem_id: mensagem.id,
          conteudo,
          cliente: { nome: cliente?.nome ?? null, telefone: cliente?.telefone ?? null },
        }),
      });
    } catch {
      // Falha ao notificar o N8N não deve impedir a mensagem de aparecer no painel
    }
  }

  return NextResponse.json({ id: mensagem.id }, { status: 201 });
}
