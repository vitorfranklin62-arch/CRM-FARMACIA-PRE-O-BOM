import { createServiceClient } from "@/lib/supabase/server";
import { chamarUazapi, configUazapi } from "@/lib/uazapi";
import { telefoneParaWhatsapp } from "@/lib/telefone";
import { logAudit } from "@/lib/audit";
import { renderizarTemplate } from "@/lib/mensagens/template";

/**
 * Envio dos avisos automáticos (pedido mudou de etapa, encomenda chegou).
 *
 * POR QUE DIRETO PELA UAZAPI (e não pelo webhook "Enviar mensagem do chat" do
 * N8N): aquele webhook é o caminho da RESPOSTA DE ATENDENTE — o N8N pausa a IA
 * por 10 min e escreve "a atendente respondeu pelo chat do CRM". Um aviso
 * automático passando por lá fazia a IA parar de atender sem ninguém da equipe
 * ter falado nada (uma das causas da "IA travando sozinha"). Mensagem enviada
 * pela API não volta como evento pro N8N, então não pausa nada.
 *
 * Garantias:
 * - Só eventos confirmados pelo sistema chamam isto (rota de status).
 * - (referência, evento) é reservado no banco ANTES de enviar: o mesmo aviso
 *   nunca sai duas vezes (clique duplo, duas telas, cartão indo e voltando).
 * - Falha no envio fica registrada e vira tarefa técnica (sem duplicar).
 * - Não muda o estado da IA na conversa.
 */

export type ResultadoAviso =
  | "enviada"
  | "ja_enviada"
  | "desligada"
  | "inativa"
  | "sem_whatsapp_configurado"
  | "telefone_invalido"
  | "falhou";

type Referencia = { pedido_id: string } | { encomenda_id: string };

/** Texto usado se a tabela de mensagens automáticas ainda não existir (migração pendente). */
const TEXTO_RESERVA: Record<string, string> = {
  encomenda_chegou:
    "Olá, {primeiro_nome}! Sua encomenda de {produto}{quantidade} já chegou na farmácia e está disponível pra retirada.",
};

function tabelaInexistente(codigo: string | undefined) {
  return codigo === "42P01" || codigo === "PGRST205" || codigo === "PGRST204";
}

async function nomeDaFarmacia(service: ReturnType<typeof createServiceClient>) {
  const { data } = await service.from("configuracoes").select("valor").eq("chave", "farmacia_nome").maybeSingle();
  return data?.valor?.trim() || "Farmácia Preço Bom";
}

/** Os avisos de PEDIDO só saem se a dona ligou o interruptor no painel. */
export async function avisosDePedidoLigados(): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service.from("configuracoes").select("valor").eq("chave", "notificacoes_pedido_ativas").maybeSingle();
  return data?.valor === "true";
}

export async function enviarAvisoAutomatico(p: {
  chave: string;
  referencia: Referencia;
  clienteId: string;
  telefone: string;
  variaveis: Record<string, string | null | undefined>;
  /** Quem disparou o evento (usuária que moveu o cartão). */
  usuarioId: string;
}): Promise<{ resultado: ResultadoAviso; detalhe?: string }> {
  const service = createServiceClient();

  // 1. Texto (editável no painel). Desativado = não envia.
  let conteudoModelo: string | null = null;
  const { data: modelo, error: erroModelo } = await service
    .from("mensagens_automaticas")
    .select("conteudo, ativo")
    .eq("chave", p.chave)
    .maybeSingle();
  if (modelo) {
    if (!modelo.ativo) return { resultado: "inativa" };
    conteudoModelo = modelo.conteudo;
  } else if (tabelaInexistente(erroModelo?.code) || !erroModelo) {
    conteudoModelo = TEXTO_RESERVA[p.chave] ?? null;
  }
  if (!conteudoModelo) return { resultado: "inativa" };

  const numero = telefoneParaWhatsapp(p.telefone);
  if (!numero) return { resultado: "telefone_invalido" };

  const config = configUazapi();
  if (!config) return { resultado: "sem_whatsapp_configurado" };

  // 2. Reserva (idempotência). Sem a tabela (migração pendente) segue sem
  // reserva — a rota de encomenda já só chama isto na transição pra "chegou".
  const { data: reserva, error: erroReserva } = await service
    .from("pedido_notificacoes")
    .insert({ ...p.referencia, evento: p.chave, status: "reservada" })
    .select("id")
    .single();
  if (erroReserva?.code === "23505") return { resultado: "ja_enviada" };
  if (erroReserva && !tabelaInexistente(erroReserva.code)) {
    return { resultado: "falhou", detalhe: "Não foi possível reservar o aviso no banco." };
  }
  const reservaId = reserva?.id ?? null;

  const texto = renderizarTemplate(conteudoModelo, { farmacia: await nomeDaFarmacia(service), ...p.variaveis });

  // 3. Envio
  const resposta = await chamarUazapi(config, "/send/text", {
    method: "POST",
    body: { number: numero, text: texto, delay: 1500, track_source: "crm_aviso", track_id: `${p.chave}:${Object.values(p.referencia)[0]}` },
  });

  if (!resposta.ok) {
    if (reservaId) {
      await service.from("pedido_notificacoes").update({ status: "falhou", motivo: resposta.erro.slice(0, 500) }).eq("id", reservaId);
    }
    await service.rpc("abrir_tarefa", {
      p: {
        titulo: "Aviso automático ao cliente não foi enviado",
        descricao: `O aviso "${p.chave}" não saiu pelo WhatsApp: ${resposta.erro}`,
        categoria: "erro_integracao",
        prioridade: "media",
        origem: "sistema",
        cliente_id: p.clienteId,
        ...("pedido_id" in p.referencia ? { pedido_id: p.referencia.pedido_id } : {}),
        sugestao_ia: "Confira em Configurações → Conexão do WhatsApp se o número está conectado e avise o cliente manualmente pelo Chat ao vivo.",
        chave_dedup: `aviso_falhou:${p.chave}:${Object.values(p.referencia)[0]}`,
        contexto: { evento: p.chave, http: resposta.status },
        ator: "sistema",
      },
    });
    return { resultado: "falhou", detalhe: resposta.erro };
  }

  // 4. Registra na conversa (aparece no Chat ao vivo) SEM mudar o estado da IA.
  const mensagemId = await registrarNaConversa(service, p.clienteId, texto, idExterno(resposta.dados));
  if (reservaId) {
    await service.from("pedido_notificacoes").update({ status: "enviada", mensagem_id: mensagemId }).eq("id", reservaId);
  }
  await logAudit(service, "pedido_status_atualizado", "pedido_notificacoes", reservaId, { aviso: p.chave, enviado: true }, p.usuarioId);
  return { resultado: "enviada" };
}

function idExterno(dados: unknown): string | null {
  if (!dados || typeof dados !== "object") return null;
  const v = (dados as Record<string, unknown>).messageid ?? (dados as Record<string, unknown>).id;
  return typeof v === "string" && v ? v : null;
}

async function registrarNaConversa(
  service: ReturnType<typeof createServiceClient>,
  clienteId: string,
  texto: string,
  externoId: string | null
): Promise<string | null> {
  const { data: recente } = await service
    .from("conversas")
    .select("id")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  let conversaId = recente?.id ?? null;
  if (!conversaId) {
    const { data: nova } = await service.from("conversas").insert({ cliente_id: clienteId, status: "aberta" }).select("id").single();
    conversaId = nova?.id ?? null;
  }
  if (!conversaId) return null;

  const linha = { conversa_id: conversaId, remetente: "ia" as const, conteudo: texto };
  const primeira = await service
    .from("mensagens")
    .insert({ ...linha, ...(externoId ? { externo_id: externoId } : {}) })
    .select("id")
    .single();
  let data = primeira.data;
  if (primeira.error && externoId) ({ data } = await service.from("mensagens").insert(linha).select("id").single());
  await service.from("conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", conversaId);
  return data?.id ?? null;
}
