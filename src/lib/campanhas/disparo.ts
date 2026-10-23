import { createServiceClient } from "@/lib/supabase/server";
import { chamarUazapi, configUazapi, interpretarEstado } from "@/lib/uazapi";
import {
  CFG,
  dentroDaJanela,
  inicioDoDiaSaoPaulo,
  montarTexto,
  segundosAteFimDaJanela,
  sortearInteiro,
  telefoneDaCampanha,
  variantesDoTelefone,
} from "@/lib/campanhas/regras";
import type { Campanha, CampanhaEnvio, CampanhaLote, CampanhaLoteStatus, FiltroCampanha } from "@/types/database";

/**
 * Disparo de campanhas pela "Mensagem em massa" da uazapi (docs.uazapi.com →
 * Mensagem em massa). O CRM decide QUEM recebe e QUANDO; a uazapi cuida do
 * intervalo entre as mensagens e devolve o resultado de cada uma.
 *
 * Uma rodada (`processarCampanhas`) faz, nesta ordem:
 *   1. sincroniza os lotes em aberto com a uazapi (enviadas, falhas, fim do lote);
 *   2. aplica as travas: disjuntor de falhas, campanha pausada, janela de horário;
 *   3. se não há lote rodando, retoma um pausado ou cria o próximo.
 * É chamada pelo agendador (a cada poucos minutos), pelo botão "Disparar" e
 * pelo webhook `sender` da uazapi quando um lote termina. Pode ser chamada à
 * vontade: tudo é idempotente, e o banco só aceita um lote ativo por vez.
 *
 * Endpoints usados (formatos conferidos em docs.uazapi.com, versão 2.6.7):
 *   POST /sender/advanced     → { folder_id, count, status }
 *   GET  /sender/listfolders  → [{ id, info, status, log_total, ... }]
 *   POST /sender/listmessages → { messages: [...], pagination: { hasMore, nextOffset } }
 *   POST /sender/edit         → { folder_id, action: stop | continue }
 *   POST /chat/check          → [{ query, isInWhatsapp, ... }]
 *   GET  /instance/wa_messages_limits → { can_send_new_messages, message_ptbr, ... }
 */

type ConfigUazapi = NonNullable<ReturnType<typeof configUazapi>>;
type Supabase = ReturnType<typeof createServiceClient>;

const LOTE_ABERTO: CampanhaLoteStatus[] = ["criando", "agendado", "enviando", "pausado"];
const LOTE_ATIVO: CampanhaLoteStatus[] = ["criando", "agendado", "enviando"];
/** Lote que ficou em "criando" (a uazapi não respondeu) e não apareceu na lista dela depois disso. */
const CRIANDO_ABANDONADO_MS = 5 * 60_000;

export type ResultadoRodada = { ok: boolean; acoes: string[] };

// Uma rodada por vez neste servidor: o agendador e o webhook podem chegar
// juntos, e duas rodadas simultâneas só fariam o mesmo trabalho em dobro.
let rodadaEmAndamento: Promise<ResultadoRodada> | null = null;

export function processarCampanhas(): Promise<ResultadoRodada> {
  if (!rodadaEmAndamento) {
    rodadaEmAndamento = rodada().finally(() => {
      rodadaEmAndamento = null;
    });
  }
  return rodadaEmAndamento;
}

async function rodada(): Promise<ResultadoRodada> {
  const config = configUazapi();
  if (!config) return { ok: false, acoes: ["UAIZAP_BASE_URL/UAIZAP_API_KEY não configurados — nada a fazer."] };

  const supabase = createServiceClient();
  const acoes: string[] = [];
  try {
    await sincronizarLotes(supabase, config, acoes);
    await iniciarProximoLote(supabase, config, acoes);
    return { ok: true, acoes };
  } catch (erro) {
    acoes.push(`Erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`);
    return { ok: false, acoes };
  }
}

// ---------------------------------------------------------------------------
// Leitura das respostas da uazapi
// ---------------------------------------------------------------------------

type Pasta = { id: string; info: string; status: string };
type MensagemLote = {
  messageid: string | null;
  telefone: string | null;
  status: string;
  erro: string | null;
  quando: string;
};

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** Lista que pode vir solta ou embrulhada (`{ folders: [...] }`, `{ data: [...] }`...). */
function lista(valor: unknown, ...chaves: string[]): unknown[] {
  if (Array.isArray(valor)) return valor;
  const obj = objeto(valor);
  for (const chave of chaves) if (obj && Array.isArray(obj[chave])) return obj[chave] as unknown[];
  return [];
}

/** Marca gravada no `info` da pasta — é por ela que se acha o lote se a uazapi não devolveu o folder_id. */
function marcadorDoLote(loteId: string) {
  return `crm-lote:${loteId}`;
}

async function listarPastas(config: ConfigUazapi): Promise<Map<string, Pasta> | null> {
  const resposta = await chamarUazapi(config, "/sender/listfolders");
  if (!resposta.ok) return null;
  const pastas = new Map<string, Pasta>();
  for (const item of lista(resposta.dados, "folders", "data")) {
    const p = objeto(item);
    const id = p && texto(p.id);
    if (!p || !id) continue;
    pastas.set(id, { id, info: texto(p.info) ?? "", status: (texto(p.status) ?? "").toLowerCase() });
  }
  return pastas;
}

/** Telefone de uma mensagem do lote: chatid "5571...@s.whatsapp.net"; se vier como LID, tenta o payload de envio. */
function telefoneDaMensagem(m: Record<string, unknown>): string | null {
  const chatid = texto(m.chatid) ?? "";
  if (chatid.endsWith("@s.whatsapp.net")) return chatid.split("@")[0].replace(/\D/g, "") || null;
  let payload: unknown = m.sendPayload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  const numero = texto(objeto(payload)?.number);
  return numero ? numero.split("@")[0].replace(/\D/g, "") || null : null;
}

async function listarMensagensDoLote(config: ConfigUazapi, folderId: string): Promise<MensagemLote[] | null> {
  const mensagens: MensagemLote[] = [];
  let offset = 0;
  // Lote tem no máximo CFG.loteTamanho mensagens; o laço é só por garantia.
  for (let pagina = 0; pagina < 10; pagina++) {
    const resposta = await chamarUazapi(config, "/sender/listmessages", {
      method: "POST",
      body: { folder_id: folderId, limit: 1000, offset },
    });
    if (!resposta.ok) return null;
    for (const item of lista(resposta.dados, "messages")) {
      const m = objeto(item);
      if (!m) continue;
      const ts = typeof m.messageTimestamp === "number" && m.messageTimestamp > 0 ? m.messageTimestamp : null;
      mensagens.push({
        messageid: texto(m.messageid),
        telefone: telefoneDaMensagem(m),
        status: (texto(m.status) ?? "").toLowerCase(),
        erro: texto(m.error),
        quando: new Date(ts ?? Date.now()).toISOString(),
      });
    }
    const paginacao = objeto(objeto(resposta.dados)?.pagination);
    if (paginacao?.hasMore !== true || typeof paginacao.nextOffset !== "number") break;
    offset = paginacao.nextOffset;
  }
  return mensagens;
}

const PENDENTE = new Set(["scheduled", "queued", ""]);
const FALHOU = new Set(["failed", "expired", "canceled", "cancelled"]);
const ENTREGUE = new Set(["delivered", "read", "played"]);
const LIDO = new Set(["read", "played"]);

/** Estado da pasta na uazapi (scheduled | sending | paused | done | deleting) → estado do lote aqui. */
function statusDaPasta(status: string): CampanhaLoteStatus | null {
  if (status === "scheduled") return "agendado";
  if (status === "sending") return "enviando";
  if (status === "paused") return "pausado";
  if (status === "done") return "concluido";
  if (status === "deleting" || status === "deleted") return "cancelado";
  return null;
}

async function editarPasta(config: ConfigUazapi, folderId: string, action: "stop" | "continue") {
  return chamarUazapi(config, "/sender/edit", { method: "POST", body: { folder_id: folderId, action } });
}

// ---------------------------------------------------------------------------
// 1 e 2. Sincronizar os lotes em aberto e aplicar as travas
// ---------------------------------------------------------------------------

async function atualizarLote(supabase: Supabase, loteId: string, dados: Partial<CampanhaLote>) {
  await supabase
    .from("campanha_lotes")
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq("id", loteId);
}

/** Quem estava reservado num lote que não vai sair volta a ser elegível pro próximo. */
async function liberarReservas(supabase: Supabase, loteId: string, motivo: string) {
  await supabase
    .from("campanha_envios")
    .update({ status: "cancelado", erro: motivo })
    .eq("lote_id", loteId)
    .eq("status", "agendado");
}

async function pausarCampanhaComMotivo(supabase: Supabase, campanhaId: string, motivo: string) {
  await supabase.from("campanhas").update({ status: "pausada", motivo_pausa: motivo.slice(0, 500) }).eq("id", campanhaId);
}

async function sincronizarLotes(supabase: Supabase, config: ConfigUazapi, acoes: string[]) {
  const { data: lotes } = await supabase.from("campanha_lotes").select("*").in("status", LOTE_ABERTO);
  if (!lotes || lotes.length === 0) return;

  const { data: campanhas } = await supabase
    .from("campanhas")
    .select("id, titulo, status")
    .in("id", Array.from(new Set(lotes.map((l) => l.campanha_id))));
  const campanhaPorId = new Map((campanhas ?? []).map((c) => [c.id, c]));

  const pastas = await listarPastas(config);
  const janelaAberta = dentroDaJanela();

  for (const lote of lotes as CampanhaLote[]) {
    const campanha = campanhaPorId.get(lote.campanha_id);
    let folderId = lote.folder_id;

    // A uazapi não respondeu na hora de criar: procura a pasta pela marca no `info`
    // antes de qualquer coisa — recriar sem conferir mandaria em dobro.
    if (!folderId) {
      if (!pastas) continue;
      const achada = Array.from(pastas.values()).find((p) => p.info.includes(marcadorDoLote(lote.id)));
      if (achada) {
        folderId = achada.id;
        await atualizarLote(supabase, lote.id, { folder_id: folderId, status: statusDaPasta(achada.status) ?? "agendado" });
        acoes.push(`Lote ${lote.id} reencontrado na uazapi (${folderId}).`);
      } else if (Date.now() - new Date(lote.criado_em).getTime() > CRIANDO_ABANDONADO_MS) {
        await atualizarLote(supabase, lote.id, { status: "falhou", erro: "A uazapi não confirmou a criação do lote." });
        await liberarReservas(supabase, lote.id, "Lote não foi criado na uazapi.");
        acoes.push(`Lote ${lote.id} descartado: a uazapi não confirmou a criação.`);
        continue;
      } else {
        continue;
      }
    }

    const mensagens = await listarMensagensDoLote(config, folderId);
    if (mensagens) await aplicarResultados(supabase, lote, mensagens);

    const pasta = pastas?.get(folderId);
    let status: CampanhaLoteStatus = lote.status === "criando" ? "agendado" : lote.status;
    if (pasta) {
      status = statusDaPasta(pasta.status) ?? status;
    } else if (pastas && mensagens && mensagens.length === 0) {
      // Sumiu da uazapi (alguém limpou as campanhas no painel dela).
      status = "cancelado";
    }
    // Sem status reconhecível, mas nada mais na fila: o lote acabou.
    if (mensagens && mensagens.length > 0 && !mensagens.some((m) => PENDENTE.has(m.status)) && status !== "cancelado") {
      status = "concluido";
    }

    if (status === "concluido" || status === "cancelado") {
      await atualizarLote(supabase, lote.id, { status, concluido_em: new Date().toISOString() });
      if (status === "concluido") {
        // Ficou alguém reservado que a uazapi não enviou: conta como falha
        // (não repete sozinho — mesma regra de quem falhou no envio).
        await supabase
          .from("campanha_envios")
          .update({ status: "falhou", erro: "A uazapi encerrou o lote sem enviar esta mensagem." })
          .eq("lote_id", lote.id)
          .eq("status", "agendado");
      } else {
        await liberarReservas(supabase, lote.id, "Lote cancelado na uazapi antes do envio.");
      }
      acoes.push(`Lote ${lote.id} ${status}.`);
      continue;
    }

    const ativo = status === "agendado" || status === "enviando";

    // Disjuntor: as últimas N mensagens processadas falharam.
    if (ativo && mensagens) {
      const desde = lote.retomado_em ?? "";
      const processadas = mensagens
        .filter((m) => !PENDENTE.has(m.status) && m.quando > desde)
        .sort((a, b) => a.quando.localeCompare(b.quando));
      let seguidas = 0;
      for (let i = processadas.length - 1; i >= 0 && FALHOU.has(processadas[i].status); i--) seguidas++;
      if (seguidas >= CFG.falhasSeguidasParaAbortar) {
        const ultimoErro = processadas[processadas.length - 1]?.erro ?? "desconhecido";
        const parou = await editarPasta(config, folderId, "stop");
        if (parou.ok) {
          await atualizarLote(supabase, lote.id, { status: "pausado", pausado_pela_janela: false });
          await pausarCampanhaComMotivo(
            supabase,
            lote.campanha_id,
            `${seguidas} falhas seguidas no envio (último erro: ${ultimoErro}). Confira a conexão do WhatsApp e clique em Retomar.`
          );
          acoes.push(`Disjuntor: lote ${lote.id} pausado após ${seguidas} falhas seguidas.`);
        } else {
          acoes.push(`Disjuntor: não consegui pausar o lote ${lote.id} na uazapi (${parou.erro}).`);
        }
        continue;
      }
    }

    // Campanha pausada (pela dona ou pelo limite do WhatsApp) com lote ainda andando.
    if (ativo && campanha?.status === "pausada") {
      const parou = await editarPasta(config, folderId, "stop");
      if (parou.ok) {
        await atualizarLote(supabase, lote.id, { status: "pausado", pausado_pela_janela: false });
        acoes.push(`Lote ${lote.id} pausado junto com a campanha.`);
      } else {
        acoes.push(`Não consegui pausar o lote ${lote.id} na uazapi (${parou.erro}).`);
      }
      continue;
    }

    // Janela de horário fechou com mensagens ainda na fila (o lote é
    // dimensionado pra caber na janela; isto é só a rede de segurança).
    const temPendente = mensagens?.some((m) => PENDENTE.has(m.status)) ?? true;
    if (ativo && !janelaAberta && temPendente) {
      const parou = await editarPasta(config, folderId, "stop");
      if (parou.ok) {
        await atualizarLote(supabase, lote.id, { status: "pausado", pausado_pela_janela: true });
        acoes.push(`Lote ${lote.id} pausado: fora da janela de horário.`);
      }
      continue;
    }

    if (status !== lote.status) await atualizarLote(supabase, lote.id, { status });
  }
}

/** Grava em campanha_envios o que a uazapi já fez com cada mensagem do lote. */
async function aplicarResultados(supabase: Supabase, lote: CampanhaLote, mensagens: MensagemLote[]) {
  const { data: linhas } = await supabase
    .from("campanha_envios")
    .select("id, telefone, status, message_id, entregue_em, lido_em")
    .eq("lote_id", lote.id);
  if (!linhas || linhas.length === 0) return;

  const porTelefone = new Map<string, (typeof linhas)[number]>();
  for (const linha of linhas) for (const v of variantesDoTelefone(linha.telefone)) porTelefone.set(v, linha);

  for (const m of mensagens) {
    if (PENDENTE.has(m.status) || !m.telefone) continue;
    const linha = variantesDoTelefone(m.telefone).map((v) => porTelefone.get(v)).find(Boolean);
    if (!linha) continue;

    const mudancas: Partial<CampanhaEnvio> = {};
    if (FALHOU.has(m.status)) {
      if (linha.status === "agendado") {
        mudancas.status = "falhou";
        mudancas.erro = (m.erro ?? `Mensagem ${m.status} na uazapi.`).slice(0, 500);
      }
    } else {
      if (linha.status === "agendado") {
        mudancas.status = "enviado";
        mudancas.erro = null;
        mudancas.enviado_em = m.quando;
      }
      if (m.messageid && !linha.message_id) mudancas.message_id = m.messageid;
      // Os recibos chegam pelo webhook; isto cobre o que se perdeu no caminho.
      if (ENTREGUE.has(m.status) && !linha.entregue_em) mudancas.entregue_em = m.quando;
      if (LIDO.has(m.status) && !linha.lido_em) mudancas.lido_em = m.quando;
    }

    if (Object.keys(mudancas).length > 0) {
      await supabase.from("campanha_envios").update(mudancas).eq("id", linha.id);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Retomar um lote pausado ou criar o próximo
// ---------------------------------------------------------------------------

async function iniciarProximoLote(supabase: Supabase, config: ConfigUazapi, acoes: string[]) {
  if (!dentroDaJanela()) {
    acoes.push("Fora da janela de horário — nenhum lote novo.");
    return;
  }

  const { data: ativo } = await supabase.from("campanha_lotes").select("id").in("status", LOTE_ATIVO).limit(1);
  if (ativo && ativo.length > 0) return;

  const agora = new Date().toISOString();
  const { data: candidatas } = await supabase
    .from("campanhas")
    .select("*")
    .eq("status", "agendada")
    .or(`agendada_para.is.null,agendada_para.lte.${agora}`)
    .order("agendada_para", { ascending: true, nullsFirst: true })
    .limit(5);
  if (!candidatas || candidatas.length === 0) return;

  const status = await chamarUazapi(config, "/instance/status");
  if (!status.ok || interpretarEstado(status.dados).situacao !== "conectado") {
    acoes.push("WhatsApp não está conectado — o disparo espera a próxima rodada.");
    return;
  }

  for (const campanha of candidatas as Campanha[]) {
    // Retomada: a campanha voltou pra "agendada" e tem um lote pausado — continua de onde parou.
    const { data: pausado } = await supabase
      .from("campanha_lotes")
      .select("*")
      .eq("campanha_id", campanha.id)
      .eq("status", "pausado")
      .maybeSingle();
    if (pausado) {
      if (!pausado.folder_id) continue;
      const retomou = await editarPasta(config, pausado.folder_id, "continue");
      if (retomou.ok) {
        await atualizarLote(supabase, pausado.id, {
          status: "agendado",
          pausado_pela_janela: false,
          retomado_em: new Date().toISOString(),
        });
        acoes.push(`Campanha "${campanha.titulo}": lote ${pausado.id} retomado.`);
      } else {
        acoes.push(`Campanha "${campanha.titulo}": não consegui retomar o lote (${retomou.erro}).`);
      }
      return;
    }

    const resultado = await criarLote(supabase, config, campanha, acoes);
    if (resultado === "criado" || resultado === "esperar") return;
    // "concluida": ninguém mais pra receber nesta; tenta a próxima campanha.
  }
}

/** Quanto falta de cota hoje, somando todas as campanhas. */
async function vagasHoje(supabase: Supabase): Promise<number> {
  const { count } = await supabase
    .from("campanha_envios")
    .select("id", { count: "exact", head: true })
    .in("status", ["agendado", "enviado", "falhou"])
    .gte("enviado_em", inicioDoDiaSaoPaulo());
  return Math.max(0, CFG.limiteDia - (count ?? 0));
}

/** Quando o próximo lote pode começar: depois da parada longa desde o fim do lote anterior. */
async function inicioDoProximoLote(supabase: Supabase): Promise<Date> {
  const minimo = Date.now() + 60_000;
  const { data: ultimo } = await supabase
    .from("campanha_lotes")
    .select("concluido_em")
    .not("concluido_em", "is", null)
    .order("concluido_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultimo?.concluido_em) return new Date(minimo);
  const pausa = sortearInteiro(CFG.pausaLongaMinMin, CFG.pausaLongaMaxMin) * 60_000;
  return new Date(Math.max(minimo, new Date(ultimo.concluido_em).getTime() + pausa));
}

type Destinatario = { cliente_id: string; numero: string; texto: string };

/** Confere na uazapi quem tem WhatsApp. Na dúvida (resposta que não deu pra ler), considera que tem. */
async function semWhatsapp(config: ConfigUazapi, numeros: string[]): Promise<Set<string>> {
  const fora = new Set<string>();
  const resposta = await chamarUazapi(config, "/chat/check", { method: "POST", body: { numbers: numeros } });
  if (!resposta.ok) return fora;
  for (const item of lista(resposta.dados, "numbers", "result", "data")) {
    const r = objeto(item);
    const consulta = texto(r?.query)?.replace(/\D/g, "");
    if (r && consulta && r.isInWhatsapp === false) fora.add(consulta);
  }
  return fora;
}

async function criarLote(
  supabase: Supabase,
  config: ConfigUazapi,
  campanha: Campanha,
  acoes: string[]
): Promise<"criado" | "esperar" | "concluida"> {
  // O WhatsApp já está limitando o número? Insistir só piora — pausa e avisa.
  const limites = await chamarUazapi(config, "/instance/wa_messages_limits");
  const dadosLimites = limites.ok ? objeto(limites.dados) : null;
  if (dadosLimites?.can_send_new_messages === false) {
    const motivo = texto(dadosLimites.provider_message_ptbr) ?? texto(dadosLimites.message_ptbr) ?? "O WhatsApp está limitando novas conversas neste número.";
    await pausarCampanhaComMotivo(supabase, campanha.id, `${motivo} Espere a restrição passar antes de retomar.`);
    acoes.push(`Campanha "${campanha.titulo}" pausada: WhatsApp limitando o número.`);
    return "esperar";
  }

  const inicio = await inicioDoProximoLote(supabase);
  const cabeNaJanela = Math.floor(segundosAteFimDaJanela(inicio) / CFG.pausaMaxSeg);
  const vagas = Math.min(CFG.loteTamanho, await vagasHoje(supabase), cabeNaJanela);
  if (vagas <= 0) {
    acoes.push("Cota do dia atingida ou sem tempo na janela — o próximo lote sai no próximo horário liberado.");
    return "esperar";
  }

  const { data: clientes, error: erroClientes } = await supabase.rpc("filtrar_clientes_campanha", {
    filtro: campanha.clientes_alvo === "por_filtro" ? ((campanha.filtro_json as FiltroCampanha | null) ?? null) : null,
  });
  if (erroClientes || !clientes) {
    acoes.push(`Campanha "${campanha.titulo}": não consegui buscar os clientes (${erroClientes?.message}).`);
    return "esperar";
  }

  const { data: registrados } = await supabase
    .from("campanha_envios")
    .select("telefone, status")
    .eq("campanha_id", campanha.id)
    .limit(10000);
  // "cancelado" = estava num lote que não saiu: pode entrar de novo.
  const jaTratados = new Set((registrados ?? []).filter((r) => r.status !== "cancelado").map((r) => r.telefone));

  // Até 3 tentativas: se a conferência do /chat/check tirar todo mundo da
  // fila, monta outra com os próximos da lista em vez de esperar 5 minutos.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const fila: Destinatario[] = [];
    const vistos = new Set<string>();
    for (const c of clientes) {
      if (fila.length >= vagas) break;
      const numero = telefoneDaCampanha(c.telefone);
      if (!numero || vistos.has(numero) || jaTratados.has(numero)) continue;
      vistos.add(numero);
      fila.push({ cliente_id: c.id, numero, texto: montarTexto(campanha.mensagem, c.nome) });
    }

    if (fila.length === 0) {
      await supabase
        .from("campanhas")
        .update({ status: "enviada", enviada_em: new Date().toISOString(), motivo_pausa: null })
        .eq("id", campanha.id);
      acoes.push(`Campanha "${campanha.titulo}" concluída: todo o público já foi tratado.`);
      return "concluida";
    }

    const fora = await semWhatsapp(config, fila.map((f) => f.numero));
    if (fora.size > 0) {
      const semZap = fila.filter((f) => fora.has(f.numero));
      await supabase.from("campanha_envios").upsert(
        semZap.map((f) => ({
          campanha_id: campanha.id,
          cliente_id: f.cliente_id,
          telefone: f.numero,
          status: "sem_whatsapp" as const,
          erro: null,
          lote_id: null,
          enviado_em: new Date().toISOString(),
        })),
        { onConflict: "campanha_id,telefone" }
      );
      for (const f of semZap) jaTratados.add(f.numero);
    }

    const aptos = fila.filter((f) => !fora.has(f.numero));
    if (aptos.length === 0) continue;

    return await entregarLote(supabase, config, campanha, aptos, inicio, acoes);
  }

  return "esperar";
}

async function entregarLote(
  supabase: Supabase,
  config: ConfigUazapi,
  campanha: Campanha,
  aptos: Destinatario[],
  inicio: Date,
  acoes: string[]
): Promise<"criado" | "esperar"> {
  // Grava o lote ANTES de chamar a uazapi. O índice único do banco só deixa
  // existir um lote ativo: se outra rodada chegou primeiro, esta para aqui.
  const { data: lote, error: erroLote } = await supabase
    .from("campanha_lotes")
    .insert({ campanha_id: campanha.id, status: "criando", total: aptos.length, agendado_para: inicio.toISOString() })
    .select("*")
    .single();
  if (erroLote || !lote) {
    acoes.push(`Campanha "${campanha.titulo}": outro lote já está em andamento.`);
    return "esperar";
  }

  // Reserva as pessoas no lote. É isso que impede a mesma pessoa de entrar
  // em dois lotes (índice único campanha + telefone).
  const { error: erroReserva } = await supabase.from("campanha_envios").upsert(
    aptos.map((f) => ({
      campanha_id: campanha.id,
      cliente_id: f.cliente_id,
      telefone: f.numero,
      status: "agendado" as const,
      erro: null,
      lote_id: lote.id,
      enviado_em: new Date().toISOString(),
    })),
    { onConflict: "campanha_id,telefone" }
  );
  if (erroReserva) {
    await atualizarLote(supabase, lote.id, { status: "falhou", erro: `Reserva no banco falhou: ${erroReserva.message}` });
    acoes.push(`Campanha "${campanha.titulo}": não consegui reservar o lote (${erroReserva.message}).`);
    return "esperar";
  }

  const resposta = await chamarUazapi(config, "/sender/advanced", {
    method: "POST",
    body: {
      delayMin: CFG.pausaMinSeg,
      delayMax: CFG.pausaMaxSeg,
      info: `${campanha.titulo.slice(0, 80)} · ${marcadorDoLote(lote.id)}`,
      scheduled_for: inicio.getTime(),
      messages: aptos.map((f) => ({ number: f.numero, type: "text", text: f.texto })),
    },
  });

  if (resposta.ok) {
    const dados = objeto(resposta.dados);
    const folderId = texto(dados?.folder_id) ?? texto(dados?.folderId);
    if (folderId) {
      await atualizarLote(supabase, lote.id, { folder_id: folderId, status: "agendado" });
      acoes.push(`Campanha "${campanha.titulo}": lote de ${aptos.length} criado na uazapi (${folderId}).`);
    } else {
      // Aceitou mas não devolveu o id: a próxima rodada acha a pasta pela marca no `info`.
      acoes.push(`Campanha "${campanha.titulo}": lote enviado, aguardando confirmação da uazapi.`);
    }
    return "criado";
  }

  // Sem resposta (timeout/5xx): o lote pode ter sido criado. Fica "criando" e
  // a próxima rodada confere na lista de campanhas da uazapi antes de qualquer coisa.
  if (resposta.status >= 500) {
    acoes.push(`Campanha "${campanha.titulo}": a uazapi não confirmou o lote (${resposta.erro}). Conferindo na próxima rodada.`);
    return "criado";
  }

  const detalhe = texto(objeto(resposta.detalhe)?.error) ?? resposta.erro;
  await atualizarLote(supabase, lote.id, { status: "falhou", erro: detalhe.slice(0, 500) });
  await liberarReservas(supabase, lote.id, "A uazapi recusou o lote.");
  await pausarCampanhaComMotivo(supabase, campanha.id, `A uazapi recusou o lote: ${detalhe}`);
  acoes.push(`Campanha "${campanha.titulo}" pausada: a uazapi recusou o lote (${detalhe}).`);
  return "esperar";
}

// ---------------------------------------------------------------------------
// Recibos de entrega/leitura (webhook messages_update)
// ---------------------------------------------------------------------------

/** Aplica um recibo do WhatsApp às mensagens de campanha com esses IDs. Nunca regride (lida não volta a "entregue"). */
export async function registrarRecibo(messageIds: string[], estado: string, quando: Date) {
  const ids = messageIds.filter(Boolean);
  const e = estado.toLowerCase();
  if (ids.length === 0 || !ENTREGUE.has(e)) return;

  const supabase = createServiceClient();
  const iso = quando.toISOString();
  await supabase.from("campanha_envios").update({ entregue_em: iso }).in("message_id", ids).is("entregue_em", null);
  if (LIDO.has(e)) {
    await supabase.from("campanha_envios").update({ lido_em: iso }).in("message_id", ids).is("lido_em", null);
  }
}

/** Pausa pedida pela dona: marca a campanha e roda a sincronização, que para o lote na uazapi. */
export async function pausarCampanha(campanhaId: string): Promise<{ loteParado: boolean }> {
  const supabase = createServiceClient();
  await pausarCampanhaComMotivo(supabase, campanhaId, "Pausada manualmente. Clique em Retomar para continuar.");
  // Se já havia uma rodada no meio do caminho, ela pode ter lido a campanha
  // antes da pausa; a segunda chamada garante uma rodada que já enxerga.
  await processarCampanhas();
  await processarCampanhas();

  const { data: ainda } = await supabase
    .from("campanha_lotes")
    .select("id")
    .eq("campanha_id", campanhaId)
    .in("status", LOTE_ATIVO)
    .limit(1);
  return { loteParado: !ainda || ainda.length === 0 };
}
