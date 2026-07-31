import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { pedidoWebhookSchema } from "@/lib/validation";

/**
 * POST /api/webhooks/pedido
 * Chamado pelo N8N quando uma venda é confirmada pela IA no WhatsApp/Instagram.
 * Cria (ou reaproveita) o cliente, o pedido e os itens do pedido.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = pedidoWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido.", detalhes: parsed.error.flatten() }, { status: 400 });
  }

  const { cliente, itens, endereco_entrega, telefone_confirmacao, pagamento_status, forma_pagamento } = parsed.data;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // 1. Resolver cliente (por id, ou por telefone, ou criar novo)
  let clienteId = cliente.id ?? null;

  if (!clienteId) {
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", cliente.telefone)
      .maybeSingle();
    clienteId = existente?.id ?? null;
  }

  if (clienteId) {
    await supabase
      .from("clientes")
      .update({ nome: cliente.nome, origem_chat: cliente.origem_chat ?? null, ultima_interacao: now })
      .eq("id", clienteId);
  } else {
    const { data: novoCliente, error: clienteError } = await supabase
      .from("clientes")
      .insert({
        nome: cliente.nome,
        telefone: cliente.telefone,
        origem_chat: cliente.origem_chat ?? null,
        ultima_interacao: now,
      })
      .select("id")
      .single();

    if (clienteError || !novoCliente) {
      return NextResponse.json({ error: "Não foi possível registrar o cliente." }, { status: 500 });
    }
    clienteId = novoCliente.id;
  }

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
        return NextResponse.json({ error: "Não foi possível registrar um dos produtos." }, { status: 500 });
      }
      produtoId = novoProduto.id;
    }

    itensResolvidos.push({ produto_id: produtoId, quantidade: item.quantidade, preco_unitario: item.preco_unitario });
  }

  const total = parsed.data.total ?? itensResolvidos.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);

  // 3. Criar pedido
  const { data: pedido, error: pedidoError } = await supabase
    .from("pedidos")
    .insert({
      cliente_id: clienteId,
      status: "novo",
      total,
      pagamento_status: pagamento_status ?? "pendente",
      forma_pagamento: forma_pagamento ?? null,
      endereco_entrega: endereco_entrega ?? null,
      telefone_confirmacao: telefone_confirmacao ?? null,
    })
    .select("id")
    .single();

  if (pedidoError || !pedido) {
    return NextResponse.json({ error: "Não foi possível criar o pedido." }, { status: 500 });
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
    return NextResponse.json({ error: "Pedido criado, mas houve erro ao salvar os itens." }, { status: 500 });
  }

  // 5. Registrar venda para o dashboard
  await supabase.from("vendas_log").insert({
    pedido_id: pedido.id,
    valor_total: total,
    data_venda: now.slice(0, 10),
  });

  return NextResponse.json({ id: pedido.id, cliente_id: clienteId, total }, { status: 201 });
}
