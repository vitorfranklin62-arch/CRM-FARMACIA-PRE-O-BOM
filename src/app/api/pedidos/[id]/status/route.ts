import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pedidoStatusSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { avisosDePedidoLigados, enviarAvisoAutomatico } from "@/lib/mensagens/automaticas";
import { codigoPedido, primeiroNome } from "@/lib/mensagens/template";
import { eventoDoAvisoDePedido } from "@/lib/mensagens/eventos-pedido";

/**
 * POST /api/pedidos/:id/status — o quadro de Pedidos move o cartão.
 *
 * Antes o quadro gravava direto no banco e nada mais acontecia. Agora a
 * mudança passa por aqui pra, quando a dona ligar os avisos (Operações →
 * Mensagens automáticas), o cliente receber a atualização certa:
 * separando → "estamos preparando"; pronto → "pronto pra retirada" ou "sai
 * pra entrega" (conforme o pedido tem endereço); finalizado → "entregue".
 * Só avança: cartão voltando de coluna não manda nada, e cada aviso sai no
 * máximo uma vez por pedido (reserva no banco).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID de pedido inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = pedidoStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  const { status } = parsed.data;

  const supabase = await createClient();
  const { data: pedido, error } = await supabase
    .from("pedidos")
    .select("id, status, endereco_entrega, cliente_id, clientes(nome, telefone)")
    .eq("id", id)
    .single();
  if (error || !pedido) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }
  if (pedido.status === status) {
    return NextResponse.json({ status, aviso: null });
  }

  const { error: erroUpdate } = await supabase.from("pedidos").update({ status }).eq("id", id);
  if (erroUpdate) {
    return NextResponse.json({ error: "Não foi possível atualizar o pedido." }, { status: 500 });
  }
  await logAudit(supabase, "pedido_status_atualizado", "pedidos", id, { status, anterior: pedido.status });

  const evento = eventoDoAvisoDePedido(pedido.status, status, !!pedido.endereco_entrega?.trim());
  let aviso: string | null = null;
  if (evento && (await avisosDePedidoLigados())) {
    const cliente = Array.isArray(pedido.clientes) ? pedido.clientes[0] : pedido.clientes;
    if (cliente?.telefone) {
      const r = await enviarAvisoAutomatico({
        chave: evento,
        referencia: { pedido_id: id },
        clienteId: pedido.cliente_id,
        telefone: cliente.telefone,
        usuarioId: usuario.id,
        variaveis: { primeiro_nome: primeiroNome(cliente.nome), numero_pedido: codigoPedido(id) },
      });
      aviso = r.resultado;
    }
  }

  return NextResponse.json({ status, aviso });
}
