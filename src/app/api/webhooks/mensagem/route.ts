import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { mensagemWebhookSchema } from "@/lib/validation";
import { normalizarTelefone } from "@/lib/telefone";
import { baixarEArmazenarMidia } from "@/lib/chat-midia";

/**
 * POST /api/webhooks/mensagem
 * Chamado pelo N8N a cada mensagem trocada no WhatsApp/Instagram — tanto a
 * mensagem do cliente quanto a resposta da IA — para aparecerem ao vivo na
 * tela de Chat. Cria o cliente e a conversa se ainda não existirem.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request, { limit: 240, windowMs: 60_000 });
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = mensagemWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido.", detalhes: parsed.error.flatten() }, { status: 400 });
  }

  const { cliente, remetente, conteudo, conversa_status, tipo, midia_url_temporaria, midia_nome, midia_mime } = parsed.data;
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const telefoneNormalizado = normalizarTelefone(cliente.telefone);

  // 1. Resolver cliente (por id explícito, ou upsert atômico por telefone)
  let clienteId: string;

  if (cliente.id) {
    // Chamador já sabe o id — atualiza direto, sem tocar em telefone.
    await supabase
      .from("clientes")
      .update({
        nome: cliente.nome,
        origem_chat: cliente.origem_chat ?? null,
        ultima_interacao: now,
        ...(cliente.foto_url ? { foto_url: cliente.foto_url } : {}),
      })
      .eq("id", cliente.id);
    clienteId = cliente.id;
  } else {
    // Upsert atômico por telefone (trava `clientes_telefone_key` no banco)
    // — evita a corrida onde duas mensagens quase simultâneas do mesmo
    // número cada uma achava "cliente não existe" e criava um duplicado.
    const { data: novoCliente, error: clienteError } = await supabase
      .from("clientes")
      .upsert(
        {
          telefone: telefoneNormalizado,
          nome: cliente.nome,
          origem_chat: cliente.origem_chat ?? null,
          ultima_interacao: now,
          ...(cliente.foto_url ? { foto_url: cliente.foto_url } : {}),
        },
        { onConflict: "telefone" }
      )
      .select("id")
      .single();

    if (clienteError || !novoCliente) {
      return NextResponse.json(
        { error: "Não foi possível registrar o cliente.", detalhe: clienteError?.message ?? null },
        { status: 500 }
      );
    }
    clienteId = novoCliente.id;
  }

  // 2. Resolver a conversa do cliente — sempre reaproveita a mais recente,
  // mesmo que esteja "fechada" (só reabre), pra não empilhar uma conversa
  // nova a cada novo atendimento do mesmo número.
  const { data: conversaRecente } = await supabase
    .from("conversas")
    .select("id")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversaId = conversaRecente?.id ?? null;

  if (!conversaId) {
    const { data: novaConversa, error: conversaError } = await supabase
      .from("conversas")
      .insert({ cliente_id: clienteId, status: conversa_status ?? "aberta" })
      .select("id")
      .single();

    if (conversaError || !novaConversa) {
      return NextResponse.json(
        { error: "Não foi possível criar a conversa.", detalhe: conversaError?.message ?? null },
        { status: 500 }
      );
    }
    conversaId = novaConversa.id;
  } else {
    await supabase.from("conversas").update({ status: conversa_status ?? "aberta" }).eq("id", conversaId);
  }

  // 3. Baixar a mídia (se tiver) e guardar uma cópia permanente no Storage do
  // CRM — o link temporário que a uazapi devolve não é garantido durar.
  // Se der qualquer problema no download, a mensagem ainda é registrada, só
  // que sem mídia (o texto/legenda que já veio no `conteudo` não se perde).
  let midia: { midia_path: string; midia_mime: string } | null = null;
  if (tipo && tipo !== "texto" && midia_url_temporaria) {
    midia = await baixarEArmazenarMidia({
      conversaId,
      tipo,
      urlTemporaria: midia_url_temporaria,
      mimeInformado: midia_mime ?? null,
    });
  }

  // 4. Registrar a mensagem
  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({
      conversa_id: conversaId,
      remetente,
      conteudo,
      tipo: midia ? tipo! : "texto",
      midia_path: midia?.midia_path ?? null,
      midia_mime: midia?.midia_mime ?? null,
      midia_nome: midia ? (midia_nome ?? null) : null,
    })
    .select("id")
    .single();

  if (mensagemError || !mensagem) {
    return NextResponse.json(
      { error: "Não foi possível registrar a mensagem.", detalhe: mensagemError?.message ?? null },
      { status: 500 }
    );
  }

  // Garante que a conversa suba pro topo da lista (ordenada por atualização mais recente)
  await supabase.from("conversas").update({ atualizado_em: now }).eq("id", conversaId);

  return NextResponse.json({ cliente_id: clienteId, conversa_id: conversaId, mensagem_id: mensagem.id }, { status: 201 });
}
