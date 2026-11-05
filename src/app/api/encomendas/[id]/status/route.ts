import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encomendaStatusSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { enviarAvisoAutomatico } from "@/lib/mensagens/automaticas";
import { primeiroNome } from "@/lib/mensagens/template";

/**
 * POST /api/encomendas/:id/status
 * Atualiza o status de uma encomenda. Ao transicionar pra "chegou", avisa o
 * cliente automaticamente por WhatsApp com o texto "Encomenda chegou" das
 * mensagens automáticas (editável no painel). O aviso sai direto pela uazapi
 * — não pelo caminho de resposta de atendente do N8N, que pausava a IA da
 * conversa sem ninguém da equipe ter falado nada.
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

  let aviso: string | null = null;
  if (vaiAvisarCliente) {
    const cliente = Array.isArray(encomenda.clientes) ? encomenda.clientes[0] : encomenda.clientes;
    if (cliente) {
      const r = await enviarAvisoAutomatico({
        chave: "encomenda_chegou",
        referencia: { encomenda_id: id },
        clienteId: encomenda.cliente_id,
        telefone: cliente.telefone,
        usuarioId: usuario.id,
        variaveis: {
          primeiro_nome: primeiroNome(cliente.nome),
          produto: encomenda.produto_nome,
          quantidade: encomenda.quantidade > 1 ? ` (${encomenda.quantidade} unidades)` : "",
        },
      });
      aviso = r.resultado;
    }
  }

  return NextResponse.json({ status, aviso });
}
