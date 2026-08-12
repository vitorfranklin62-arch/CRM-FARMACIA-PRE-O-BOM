import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { pedidoWebhookSchema } from "@/lib/validation";
import { normalizarTelefone } from "@/lib/telefone";

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

  const { cliente, itens, endereco_entrega, telefone_confirmacao, pagamento_status, forma_pagamento, taxa_entrega } =
    parsed.data;
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
    // — evita a corrida onde duas chamadas quase simultâneas do mesmo
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

  // Sem `total` explícito, soma os itens + a taxa de entrega (se veio) —
  // assim o valor cobrado do cliente já reflete a entrega calculada.
  const total =
    parsed.data.total ??
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
