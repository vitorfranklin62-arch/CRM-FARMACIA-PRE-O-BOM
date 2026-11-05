import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { mensagemWebhookSchema } from "@/lib/validation";
import { normalizarTelefone } from "@/lib/telefone";
import { baixarEArmazenarMidia } from "@/lib/chat-midia";
import { pedidoDeOptout, registrarOptout } from "@/lib/optout";
import { estadoIa } from "@/lib/ia/estado";
import { atualizarEstadoConversa, travarIaSemPrazo } from "@/lib/ia/pausa";

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

  const { cliente, remetente, conteudo, conversa_status, tipo, midia_url_temporaria, midia_nome, midia_mime, mensagem_externa_id } =
    parsed.data;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // 0. Evento repetido (o WhatsApp/N8N às vezes entrega a mesma mensagem 2x):
  // devolve o que já foi gravado e não mexe em mais nada — nem no estado da IA.
  if (mensagem_externa_id) {
    const repetida = await buscarMensagemPorIdExterno(supabase, mensagem_externa_id);
    if (repetida) return respostaDuplicada(repetida);
  }
  const telefoneNormalizado = normalizarTelefone(cliente.telefone);
  const nomeInformado = cliente.nome?.trim() || null;

  // 1. Resolver cliente (por id explícito, ou upsert atômico por telefone)
  let clienteId: string;

  if (cliente.id) {
    // Chamador já sabe o id — atualiza direto, sem tocar em telefone.
    await supabase
      .from("clientes")
      .update({
        ...(nomeInformado ? { nome: nomeInformado } : {}),
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
    // Sem nome no payload, não sobrescreve o nome de um cliente que já existe
    // (só usa o telefone como nome quando o cliente é novo).
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", telefoneNormalizado)
      .maybeSingle();

    const { data: novoCliente, error: clienteError } = await supabase
      .from("clientes")
      .upsert(
        {
          telefone: telefoneNormalizado,
          ...(nomeInformado || !existente ? { nome: nomeInformado || telefoneNormalizado } : {}),
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
      .insert({ cliente_id: clienteId, status: conversa_status === "fechada" ? "fechada" : "aberta" })
      .select("id")
      .single();

    if (conversaError || !novaConversa) {
      return NextResponse.json(
        { error: "Não foi possível criar a conversa.", detalhe: conversaError?.message ?? null },
        { status: 500 }
      );
    }
    conversaId = novaConversa.id;
    if (conversa_status === "aguardando_humano") {
      await travarIaSemPrazo(supabase, conversaId, motivoDaTrava(remetente), atorDoWebhook(remetente), {
        ia_evento_id: mensagem_externa_id ?? null,
      });
    }
  } else {
    await atualizarEstadoDaConversa(supabase, conversaId, { conversa_status, remetente, mensagem_externa_id });
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
  const linhaMensagem = {
    conversa_id: conversaId,
    remetente,
    conteudo,
    tipo: midia ? tipo! : "texto",
    midia_path: midia?.midia_path ?? null,
    midia_mime: midia?.midia_mime ?? null,
    midia_nome: midia ? (midia_nome ?? null) : null,
  } as const;
  let { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({ ...linhaMensagem, ...(mensagem_externa_id ? { externo_id: mensagem_externa_id } : {}) })
    .select("id")
    .single();

  // Duas entregas do mesmo evento ao mesmo tempo: o índice único do banco barra
  // a segunda, que devolve a primeira.
  if (mensagemError?.code === "23505" && mensagem_externa_id) {
    const repetida = await buscarMensagemPorIdExterno(supabase, mensagem_externa_id);
    if (repetida) return respostaDuplicada(repetida);
  }
  // Banco ainda sem a coluna externo_id (migração 20261105 não rodada): grava como antes.
  if (mensagemError && mensagem_externa_id && (mensagemError.code === "PGRST204" || mensagemError.code === "42703")) {
    ({ data: mensagem, error: mensagemError } = await supabase.from("mensagens").insert(linhaMensagem).select("id").single());
  }

  if (mensagemError || !mensagem) {
    return NextResponse.json(
      { error: "Não foi possível registrar a mensagem.", detalhe: mensagemError?.message ?? null },
      { status: 500 }
    );
  }

  // Garante que a conversa suba pro topo da lista (ordenada por atualização mais recente)
  await supabase.from("conversas").update({ atualizado_em: now }).eq("id", conversaId);

  // 5. Pedido de descadastro ("SAIR"): o rodapé das campanhas promete isso, então
  // cumprimos aqui, no único ponto por onde toda mensagem do cliente passa.
  // `optout: true` na resposta deixa o N8N pular a resposta da IA, que não
  // deve tentar "atender" um SAIR.
  let optout = false;
  if (remetente === "cliente" && pedidoDeOptout(conteudo)) {
    try {
      await registrarOptout(clienteId, telefoneNormalizado);
      optout = true;
    } catch {
      // A mensagem já foi registrada; se o descadastro falhar, o cliente repete o SAIR.
    }
  }

  return NextResponse.json(
    { cliente_id: clienteId, conversa_id: conversaId, mensagem_id: mensagem.id, optout },
    { status: 201 }
  );
}

type ServiceClient = ReturnType<typeof createServiceClient>;
type Remetente = "ia" | "cliente" | "funcionaria";

/** A IA chamando atendente (tool chamar_atendente do N8N) é uma transferência. */
function motivoDaTrava(remetente: Remetente) {
  return remetente === "ia" ? ("transferencia_ia" as const) : ("manual" as const);
}

function atorDoWebhook(remetente: Remetente) {
  return remetente === "ia" ? "ia" : "n8n";
}

async function buscarMensagemPorIdExterno(supabase: ServiceClient, externoId: string) {
  const { data, error } = await supabase
    .from("mensagens")
    .select("id, conversa_id, conversas(cliente_id)")
    .eq("externo_id", externoId)
    .maybeSingle();
  if (error || !data) return null;
  const conversa = Array.isArray(data.conversas) ? data.conversas[0] : data.conversas;
  return { mensagem_id: data.id, conversa_id: data.conversa_id, cliente_id: conversa?.cliente_id ?? null };
}

function respostaDuplicada(r: { mensagem_id: string; conversa_id: string; cliente_id: string | null }) {
  return NextResponse.json({ ...r, optout: false, duplicada: true }, { status: 200 });
}

/**
 * Regras de estado quando chega mensagem numa conversa que já existe:
 * - O chamador pediu um status (ex.: a IA transferiu pra atendente) → aplica,
 *   com motivo registrado. Transferência fica SEM prazo (até alguém destravar
 *   ou até a rotina das 22h).
 * - Senão, uma trava/pausa vigente é mantida (a IA não volta por cima do
 *   atendente); uma pausa cujo prazo já venceu é liberada; conversa fechada reabre.
 */
async function atualizarEstadoDaConversa(
  supabase: ServiceClient,
  conversaId: string,
  p: { conversa_status?: "aberta" | "aguardando_humano" | "fechada" | null; remetente: Remetente; mensagem_externa_id?: string | null }
) {
  let atual: { status: string; ia_pausada_ate?: string | null } | null = null;
  const comEstado = await supabase.from("conversas").select("status, ia_pausada_ate").eq("id", conversaId).single();
  if (comEstado.error) {
    // Banco sem as colunas novas: comportamento antigo.
    const simples = await supabase.from("conversas").select("status").eq("id", conversaId).single();
    atual = simples.data;
  } else {
    atual = comEstado.data;
  }
  const evento = p.mensagem_externa_id ?? null;

  if (p.conversa_status === "aguardando_humano") {
    await travarIaSemPrazo(supabase, conversaId, motivoDaTrava(p.remetente), atorDoWebhook(p.remetente), { ia_evento_id: evento });
    return;
  }
  if (p.conversa_status && p.conversa_status !== atual?.status) {
    await atualizarEstadoConversa(supabase, conversaId, { status: p.conversa_status, ia_motivo: "webhook", ia_ator: "n8n" });
    return;
  }
  if (!atual || p.conversa_status) return;

  if (atual.status === "fechada") {
    await atualizarEstadoConversa(supabase, conversaId, { status: "aberta", ia_motivo: "cliente_reabriu", ia_ator: "sistema" });
  } else if (atual.status === "aguardando_humano" && estadoIa(atual) === "IA_ATIVA") {
    await atualizarEstadoConversa(supabase, conversaId, {
      status: "aberta",
      ia_motivo: "pausa_expirada",
      ia_ator: "sistema",
      ia_evento_id: evento,
    });
  }
}
