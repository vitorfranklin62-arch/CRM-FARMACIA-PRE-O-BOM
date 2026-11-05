import { NextResponse } from "next/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ferramentaIaSchema } from "@/lib/validation";
import { clienteDoTelefone } from "@/lib/ia/cliente";
import { logAudit } from "@/lib/audit";
import { codigoPedido } from "@/lib/mensagens/template";

/**
 * POST /api/ia/ferramentas — "Tool Router" da Vitória (IA do WhatsApp).
 *
 *   IA (N8N) → esta rota → validação → serviço do CRM → banco → audit_log
 *
 * Regras de segurança (o modelo NUNCA acessa o banco direto):
 * 1. Autenticação: mesmo Bearer `N8N_WEBHOOK_SECRET` dos webhooks.
 * 2. Lista fechada de ferramentas, cada uma com entrada validada (zod).
 * 3. Escopo: `telefone_cliente` é o número DA CONVERSA, preenchido pelo N8N
 *    a partir do WhatsApp — não pela IA. Toda consulta é limitada a esse
 *    cliente: "me mostra o pedido do fulano" não vaza dado de outra pessoa.
 * 4. Só leitura de dados reais + abertura de tarefa. Nada de confirmar
 *    pagamento, mudar preço ou cancelar pedido: o que exige decisão vira
 *    tarefa para a equipe.
 * 5. Toda chamada fica no audit_log (sem conteúdo pessoal).
 */

const ETAPA_PARA_CLIENTE: Record<string, (entrega: boolean) => string> = {
  novo: () => "recebido, aguardando a separação",
  separando: () => "em separação",
  pronto: (entrega) => (entrega ? "pronto, saindo para entrega" : "pronto para retirada na loja"),
  entregue: (entrega) => (entrega ? "entregue" : "retirado/finalizado"),
};

const PENDENCIA: Record<
  "reclamacao" | "produto_indisponivel" | "problema_pedido" | "pagamento" | "outro",
  { categoria: string; prioridade: string; titulo: string; sugestao: string }
> = {
  reclamacao: {
    categoria: "reclamacao",
    prioridade: "alta",
    titulo: "Reclamação de cliente pelo WhatsApp",
    sugestao: "Leia a conversa no Chat ao vivo e responda o cliente com a solução ou um prazo claro.",
  },
  produto_indisponivel: {
    categoria: "produto_indisponivel",
    prioridade: "media",
    titulo: "Cliente procurou produto que está em falta",
    sugestao: "Verifique reposição ou encomenda (aba Encomendas) e retorne ao cliente.",
  },
  problema_pedido: {
    categoria: "atendimento",
    prioridade: "alta",
    titulo: "Problema com pedido relatado pelo cliente",
    sugestao: "Confira o pedido no quadro e fale com o cliente antes de qualquer alteração.",
  },
  pagamento: {
    categoria: "pagamento_pendente",
    prioridade: "media",
    titulo: "Pendência de pagamento informada na conversa",
    sugestao: "Confira o pagamento no sistema. Não marque como pago sem comprovação.",
  },
  outro: {
    categoria: "atendimento",
    prioridade: "media",
    titulo: "Pendência registrada pela IA",
    sugestao: "Leia a conversa e decida o próximo passo.",
  },
};

function hojeEmSalvador() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
}

export async function POST(request: Request) {
  const unauthorized = authorizeWebhook(request, { limit: 240, windowMs: 60_000 });
  if (unauthorized) return unauthorized;

  const parsed = ferramentaIaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ferramenta ou argumentos inválidos.", detalhes: parsed.error.flatten() }, { status: 400 });
  }
  const pedido = parsed.data;
  const supabase = createServiceClient();
  const cliente = await clienteDoTelefone(pedido.telefone_cliente);

  let resposta: Record<string, unknown>;

  if (pedido.ferramenta === "consultar_pedidos") {
    if (!cliente) {
      resposta = { encontrado: false, pedidos: [], instrucao: "Não há pedidos para este número. Não invente pedido nem status." };
    } else {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, status, total, pagamento_status, criado_em, endereco_entrega")
        .eq("cliente_id", cliente.id)
        .order("criado_em", { ascending: false })
        .limit(5);
      if (error) return erroInterno("consultar_pedidos");
      resposta = {
        encontrado: true,
        pedidos: (data ?? []).map((p) => ({
          codigo: codigoPedido(p.id),
          etapa: ETAPA_PARA_CLIENTE[p.status]?.(!!p.endereco_entrega) ?? p.status,
          pagamento: p.pagamento_status === "confirmado" ? "confirmado no sistema" : "ainda não confirmado",
          total: p.total,
          feito_em: new Date(p.criado_em).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }),
          entrega: !!p.endereco_entrega,
        })),
        instrucao:
          "Informe só estes dados. Nunca diga que o pagamento foi confirmado se estiver 'ainda não confirmado'. Não prometa prazo de entrega.",
      };
    }
  } else if (pedido.ferramenta === "consultar_produto") {
    const { data, error } = await supabase.rpc("buscar_produtos", { termo: pedido.argumentos.termo });
    if (error) return erroInterno("consultar_produto");
    const lista = (data ?? []).slice(0, 5);
    resposta = {
      produtos: lista.map((p) => ({ nome: p.nome, laboratorio: p.laboratorio, preco: p.preco, disponivel: p.estoque > 0 })),
      instrucao:
        "Use só estes preços e disponibilidades. Produto com disponivel=false está em falta: ofereça encomenda ou registre a pendência. Nada de orientação clínica: dúvida sobre uso/receita vai para o farmacêutico.",
    };
  } else {
    const regra = PENDENCIA[pedido.argumentos.tipo];
    let conversaId: string | null = null;
    if (cliente) {
      const { data: c } = await supabase
        .from("conversas")
        .select("id")
        .eq("cliente_id", cliente.id)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      conversaId = c?.id ?? null;
    }
    const { data, error } = await supabase.rpc("abrir_tarefa", {
      p: {
        titulo: cliente ? `${regra.titulo} — ${cliente.nome}` : regra.titulo,
        descricao: pedido.argumentos.resumo,
        categoria: regra.categoria,
        prioridade: pedido.argumentos.urgente ? "urgente" : regra.prioridade,
        origem: "ia",
        cliente_id: cliente?.id ?? null,
        conversa_id: conversaId,
        sugestao_ia: regra.sugestao,
        // Mesmo tipo de pendência do mesmo cliente no mesmo dia = mesma tarefa.
        chave_dedup: `ia:${pedido.argumentos.tipo}:${cliente?.id ?? pedido.telefone_cliente.replace(/\D/g, "")}:${hojeEmSalvador()}`,
        ator: "ia",
      },
    });
    if (error || !data) return erroInterno("registrar_pendencia");
    resposta = {
      registrado: true,
      numero_tarefa: data.numero,
      ja_existia: !data.criada,
      instrucao: "Diga ao cliente que a equipe vai verificar e retornar por aqui. Não prometa prazo nem solução.",
    };
  }

  await logAudit(supabase, "ia_ferramenta_executada", "ia_ferramentas", null, {
    ferramenta: pedido.ferramenta,
    cliente_encontrado: !!cliente,
  });
  return NextResponse.json(resposta);
}

function erroInterno(ferramenta: string) {
  return NextResponse.json(
    { error: `A ferramenta ${ferramenta} falhou.`, instrucao: "Avise o cliente que vai verificar com a equipe e chame a atendente." },
    { status: 502 }
  );
}
