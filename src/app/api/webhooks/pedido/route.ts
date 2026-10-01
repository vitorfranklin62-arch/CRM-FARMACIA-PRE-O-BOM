import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { pedidoWebhookSchema } from "@/lib/validation";
import { lerCorpo } from "@/lib/api";
import { registrarClienteWebhook } from "@/lib/clientes-webhook";

/**
 * POST /api/webhooks/pedido
 * Chamado pelo N8N quando uma venda é confirmada pela IA no WhatsApp/Instagram.
 * Cria (ou reaproveita) o cliente, o pedido e os itens do pedido.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request);
  if (unauthorized) return unauthorized;

  const corpo = await lerCorpo(request, pedidoWebhookSchema, { comDetalhes: true });
  if (corpo.resposta) return corpo.resposta;
  const dados = corpo.dados;

  const { cliente, itens, endereco_entrega, telefone_confirmacao, pagamento_status, forma_pagamento, taxa_entrega } =
    dados;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // 1. Resolver cliente (por id explícito, ou upsert atômico por telefone)
  const resultadoCliente = await registrarClienteWebhook(supabase, cliente, now);
  if (resultadoCliente.resposta) return resultadoCliente.resposta;
  const clienteId = resultadoCliente.clienteId;

  // 2. Resolver produtos de cada item (por id, sku, nome, ou criar um registro básico)
  const itensResolvidos: { produto_id: string; quantidade: number; preco_unitario: number }[] = [];

  for (const item of itens) {
    let produtoId = item.produto_id ?? null;

    if (!produtoId && item.sku) {
      const { data } = await supabase.from("produtos").select("id").eq("sku", item.sku).maybeSingle();
      produtoId = data?.id ?? null;
    }

    if (!produtoId && item.nome) {
      const { data } = await supabase.from("produtos").select("id").ilike("nome", item.nome).limit(1).maybeSingle();
      produtoId = data?.id ?? null;
    }

    if (!produtoId) {
      const { data: novoProduto, error } = await supabase
        .from("produtos")
        .insert({ nome: item.nome ?? "Produto não identificado", preco: item.preco_unitario, sku: item.sku ?? null })
        .select("id")
        .single();

      if (error || !novoProduto) {
        return NextResponse.json(
          { error: "Não foi possível registrar um dos produtos.", detalhe: error?.message ?? null },
          { status: 500 }
        );
      }
      produtoId = novoProduto.id;
    }

    itensResolvidos.push({ produto_id: produtoId, quantidade: item.quantidade, preco_unitario: item.preco_unitario });
  }

  // Sem `total` explícito, soma os itens + a taxa de entrega (se veio) —
  // assim o valor cobrado do cliente já reflete a entrega calculada.
  const total =
    dados.total ??
    itensResolvidos.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0) + (taxa_entrega ?? 0);

  // Trava contra duplicata: se o N8N reenviar o mesmo webhook (retry por
  // falha, reprocessamento após reinício, etc.), o mesmo cliente confirmando
  // uma compra do mesmo valor de novo dentro de pouco tempo é sinal de
  // duplicata, não de dois pedidos de verdade — devolve o pedido que já
  // existe em vez de criar outro.
  const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: pedidoRecente } = await supabase
    .from("pedidos")
    .select("id, total")
    .eq("cliente_id", clienteId)
    .eq("total", total)
    .gte("criado_em", duasHorasAtras)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pedidoRecente) {
    return NextResponse.json(
      { id: pedidoRecente.id, cliente_id: clienteId, total, duplicado: true },
      { status: 200 }
    );
  }

  // 3. Criar pedido
  const { data: pedido, error: pedidoError } = await supabase
    .from("pedidos")
    .insert({
      cliente_id: clienteId,
      status: "novo",
      total,
      pagamento_status: pagamento_status ?? "pendente",
      forma_pagamento: forma_pagamento ?? null,
      taxa_entrega: taxa_entrega ?? null,
      endereco_entrega: endereco_entrega ?? null,
      telefone_confirmacao: telefone_confirmacao ?? null,
    })
    .select("id")
    .single();

  if (pedidoError || !pedido) {
    return NextResponse.json(
      { error: "Não foi possível criar o pedido.", detalhe: pedidoError?.message ?? null },
      { status: 500 }
    );
  }

  // 4. Criar itens do pedido
  const { error: itensError } = await supabase.from("itens_pedido").insert(
    itensResolvidos.map((item) => ({
      pedido_id: pedido.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
    }))
  );

  if (itensError) {
    return NextResponse.json(
      { error: "Pedido criado, mas houve erro ao salvar os itens.", detalhe: itensError.message },
      { status: 500 }
    );
  }

  // 5. Registrar venda para o dashboard
  await supabase.from("vendas_log").insert({
    pedido_id: pedido.id,
    valor_total: total,
    data_venda: now.slice(0, 10),
  });

  return NextResponse.json({ id: pedido.id, cliente_id: clienteId, total }, { status: 201 });
}
