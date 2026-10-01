import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encomendaStatusSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { lerCorpo, ehUuid } from "@/lib/api";
import { notificarMensagemChat } from "@/lib/n8n";
import { buscarConversaRecente } from "@/lib/conversas";
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
  if (!ehUuid(id)) {
    return NextResponse.json({ error: "ID de encomenda inválido." }, { status: 400 });
  }

  const corpo = await lerCorpo(request, encomendaStatusSchema, { erro: "Status inválido." });
  if (corpo.resposta) return corpo.resposta;

  const { status } = corpo.dados;
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
  let conversaId = await buscarConversaRecente(supabase, clienteId);

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

  await notificarMensagemChat({
    conversaId,
    mensagemId: mensagem.id,
    conteudo,
    cliente: { nome: clienteNome, telefone: clienteTelefone },
  });
}
