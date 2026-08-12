import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encomendaStatusSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/types/database";

/**
 * POST /api/encomendas/:id/status
 * Atualiza o status de uma encomenda. Ao transicionar pra "chegou", avisa o
 * cliente automaticamente por WhatsApp — mesmo caminho de entrega do Chat ao
 * vivo (salva a mensagem e notifica o N8N), só que disparado pelo sistema em
 * vez de digitado por uma funcionária.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireUser();

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID de encomenda inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = encomendaStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const { status } = parsed.data;
  const supabase = await createClient();

  const { data: encomenda, error: encomendaError } = await supabase
    .from("encomendas")
    .select("id, status, produto_nome, quantidade, cliente_id, clientes(nome, telefone)")
    .eq("id", id)
    .single();

  if (encomendaError || !encomenda) {
    return NextResponse.json({ error: "Encomenda não encontrada." }, { status: 404 });
  }

  const vaiAvisarCliente = status === "chegou" && encomenda.status !== "chegou";

  const { error: updateError } = await supabase
    .from("encomendas")
    .update({ status, ...(vaiAvisarCliente ? { avisado_em: new Date().toISOString() } : {}) })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Não foi possível atualizar a encomenda." }, { status: 500 });
  }

  await logAudit(supabase, "encomenda_status_atualizado", "encomendas", id, { status });

  if (vaiAvisarCliente) {
    const cliente = Array.isArray(encomenda.clientes) ? encomenda.clientes[0] : encomenda.clientes;
    if (cliente) {
      await avisarClienteEncomendaChegou(supabase, {
        clienteId: encomenda.cliente_id,
        clienteNome: cliente.nome,
        clienteTelefone: cliente.telefone,
        produtoNome: encomenda.produto_nome,
        quantidade: encomenda.quantidade,
        usuarioId: usuario.id,
      });
    }
  }

  return NextResponse.json({ status });
}

/**
 * Avisa o cliente que a encomenda chegou: registra a mensagem na conversa
 * dele (aparece no Chat ao vivo, igual qualquer outra mensagem enviada pela
 * equipe) e notifica o N8N pra entregar via UAIZAP/WhatsApp. Best-effort —
 * se qualquer etapa falhar, a encomenda já mudou de status mesmo assim.
 */
async function avisarClienteEncomendaChegou(
  supabase: SupabaseClient<Database>,
  params: {
    clienteId: string;
    clienteNome: string;
    clienteTelefone: string;
    produtoNome: string;
    quantidade: number;
    usuarioId: string;
  }
) {
  const { clienteId, clienteNome, clienteTelefone, produtoNome, quantidade, usuarioId } = params;

  // Reaproveita a conversa mais recente do cliente (mesmo critério do
  // webhook de mensagens), só cria uma nova se ele nunca teve conversa.
  const { data: conversaRecente } = await supabase
    .from("conversas")
    .select("id")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversaId = conversaRecente?.id ?? null;

  if (!conversaId) {
    const { data: novaConversa } = await supabase
      .from("conversas")
      .insert({ cliente_id: clienteId, status: "aberta" })
      .select("id")
      .single();
    conversaId = novaConversa?.id ?? null;
  }

  if (!conversaId) return;

  const quantidadeTexto = quantidade > 1 ? ` (${quantidade} unidades)` : "";
  const conteudo = `Olá, ${clienteNome}! Sua encomenda de "${produtoNome}"${quantidadeTexto} já chegou na farmácia e está disponível pra retirada.`;

  const { data: mensagem } = await supabase
    .from("mensagens")
    .insert({ conversa_id: conversaId, remetente: "funcionaria", usuario_id: usuarioId, conteudo })
    .select("id")
    .single();

  await supabase.from("conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", conversaId);

  if (!mensagem) return;

  const service = createServiceClient();
  const { data: config } = await service
    .from("configuracoes")
    .select("valor")
    .eq("chave", "integracao_n8n_chat_webhook_url")
    .maybeSingle();

  const webhookUrl = config?.valor;
  const secret = process.env.N8N_WEBHOOK_SECRET;

  if (webhookUrl && secret) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          conversa_id: conversaId,
          mensagem_id: mensagem.id,
          conteudo,
          cliente: { nome: clienteNome, telefone: clienteTelefone },
        }),
      });
    } catch {
      // Falha ao notificar o N8N não deve impedir o status de já ter mudado
    }
  }
}
