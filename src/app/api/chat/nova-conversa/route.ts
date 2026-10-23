import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { novaConversaSchema } from "@/lib/validation";
import { telefoneParaWhatsapp } from "@/lib/telefone";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/chat/nova-conversa  { nome, telefone, conteudo }
 * Botão "Nova conversa" do Chat ao vivo: a equipe manda a primeira mensagem
 * pra um número (cliente cadastrado ou não). Cadastra o cliente se ainda não
 * existir, reaproveita a conversa mais recente dele (mesma regra do webhook
 * de mensagens, pra não empilhar conversa duplicada) e entrega pelo N8N.
 *
 * Respostas (201): { conversa_id, whatsapp }
 *  whatsapp = "enviado"         N8N aceitou e repassou ao WhatsApp.
 *           = "nao_configurado" webhook do N8N/segredo ausente: ficou só no CRM.
 *           = "falhou"          N8N respondeu com erro: ficou só no CRM.
 *           = "incerto"         N8N não respondeu a tempo: pode ter saído, conferir antes de reenviar.
 * A mensagem fica salva no CRM em todos os casos — mesmo comportamento do
 * envio de texto normal (/api/chat/enviar) — e a tela avisa quando não saiu.
 */
export async function POST(request: Request) {
  const usuario = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = novaConversaSchema.safeParse(body);
  if (!parsed.success) {
    const primeiroErro = parsed.error.issues[0]?.message;
    return NextResponse.json({ error: primeiroErro ?? "Dados inválidos." }, { status: 400 });
  }

  const { nome, conteudo } = parsed.data;
  const telefone = telefoneParaWhatsapp(parsed.data.telefone);
  if (!telefone) {
    return NextResponse.json(
      { error: "Número inválido. Use DDD + número, ex.: (71) 99937-3863." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 1. Cliente: reaproveita pelo telefone ou cadastra.
  let { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, telefone")
    .eq("telefone", telefone)
    .maybeSingle();

  if (!cliente) {
    const { data: novo, error } = await supabase
      .from("clientes")
      .insert({ nome, telefone, origem_chat: "whatsapp", ultima_interacao: new Date().toISOString() })
      .select("id, nome, telefone")
      .single();

    if (error?.code === "23505") {
      // Outra mensagem cadastrou o mesmo número ao mesmo tempo — usa esse.
      ({ data: cliente } = await supabase
        .from("clientes")
        .select("id, nome, telefone")
        .eq("telefone", telefone)
        .maybeSingle());
    } else if (error || !novo) {
      return NextResponse.json({ error: "Não foi possível cadastrar o contato." }, { status: 500 });
    } else {
      cliente = novo;
      await logAudit(supabase, "cliente_criado", "clientes", novo.id, { nome, origem: "nova_conversa_chat" });
    }
  } else if (cliente.nome === cliente.telefone) {
    // Cliente criado pelo webhook sem nome (o nome virou o próprio número):
    // aproveita o nome que a equipe acabou de digitar. Nome já existente não
    // é sobrescrito.
    await supabase.from("clientes").update({ nome }).eq("id", cliente.id);
  }

  if (!cliente) {
    return NextResponse.json({ error: "Não foi possível cadastrar o contato." }, { status: 500 });
  }

  // 2. Conversa: a mais recente do cliente, ou uma nova. A equipe está
  // puxando o assunto, então a IA fica travada nela ("aguardando_humano"),
  // igual quando alguém responde manualmente pelo Chat ao vivo.
  const { data: conversaRecente } = await supabase
    .from("conversas")
    .select("id")
    .eq("cliente_id", cliente.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversaId = conversaRecente?.id ?? null;
  if (!conversaId) {
    const { data: novaConversa, error } = await supabase
      .from("conversas")
      .insert({ cliente_id: cliente.id, status: "aguardando_humano" })
      .select("id")
      .single();
    if (error || !novaConversa) {
      return NextResponse.json({ error: "Não foi possível criar a conversa." }, { status: 500 });
    }
    conversaId = novaConversa.id;
  }

  // 3. Mensagem
  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({ conversa_id: conversaId, remetente: "funcionaria", usuario_id: usuario.id, conteudo })
    .select("id")
    .single();

  if (mensagemError || !mensagem) {
    return NextResponse.json({ error: "Não foi possível registrar a mensagem." }, { status: 500 });
  }

  await supabase
    .from("conversas")
    .update({ atualizado_em: new Date().toISOString(), status: "aguardando_humano" })
    .eq("id", conversaId);

  // 4. Entrega pelo N8N → uazapi (mesmo webhook e formato do /api/chat/enviar)
  const service = createServiceClient();
  const { data: config } = await service
    .from("configuracoes")
    .select("valor")
    .eq("chave", "integracao_n8n_chat_webhook_url")
    .maybeSingle();

  const webhookUrl = config?.valor;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  let whatsapp: "enviado" | "nao_configurado" | "falhou" | "incerto" = "nao_configurado";

  if (webhookUrl && secret) {
    try {
      const resposta = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          conversa_id: conversaId,
          mensagem_id: mensagem.id,
          conteudo,
          cliente: { nome: cliente.nome === cliente.telefone ? nome : cliente.nome, telefone: cliente.telefone },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      whatsapp = resposta.ok ? "enviado" : "falhou";
    } catch {
      whatsapp = "incerto";
    }
  }

  return NextResponse.json({ conversa_id: conversaId, whatsapp }, { status: 201 });
}
