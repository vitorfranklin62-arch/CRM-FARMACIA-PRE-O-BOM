/**
 * Disparo de campanhas de ponta a ponta, SEM mandar nada de verdade: a uazapi
 * é simulada trocando o `fetch`, e o banco é o de tests/apoio/supabase-falso.ts.
 * Roda o código real de src/lib/campanhas/disparo.ts.
 */
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { banco, zerarBanco } from "./apoio/supabase-falso.ts";
import { processarCampanhas, registrarRecibo } from "../src/lib/campanhas/disparo.ts";
import { CFG } from "../src/lib/campanhas/regras.ts";

// Lidas na hora de cada chamada (configUazapi), então basta definir aqui.
process.env.UAIZAP_BASE_URL = "https://farmacia-teste.uazapi.com";
process.env.UAIZAP_API_KEY = "token-de-teste";

const DONA = "00000000-0000-0000-0000-0000000000d1";
const CAMP = "11111111-1111-4111-8111-111111111111";
const IMAGEM = `${CAMP}/22222222-2222-4222-8222-222222222222.jpg`;
// Terça, 17/11/2026, 14h em São Paulo: dentro da janela de envio.
const TERCA_14H = new Date("2026-11-17T14:00:00-03:00").getTime();

type Chamada = { caminho: string; corpo: Record<string, unknown> | null; token: string | null };
let chamadas: Chamada[] = [];
let respostas: Record<string, (corpo: Record<string, unknown> | null) => { status: number; json: unknown }> = {};

function uazapiPadrao() {
  let pasta = 0;
  respostas = {
    "/instance/status": () => ({ status: 200, json: { instance: { status: "connected" }, status: { connected: true, loggedIn: true } } }),
    "/instance/wa_messages_limits": () => ({ status: 200, json: { can_send_new_messages: true } }),
    "/chat/check": (c) => ({
      status: 200,
      json: (c?.numbers as string[]).map((n) => ({ query: n, isInWhatsapp: n.length === 13, jid: `${n}@s.whatsapp.net` })),
    }),
    "/sender/advanced": (c) => ({ status: 200, json: { folder_id: `pasta-${++pasta}`, count: (c?.messages as unknown[]).length, status: "queued" } }),
    "/sender/listfolders": () => ({ status: 200, json: [] }),
    "/sender/listmessages": () => ({ status: 200, json: { messages: [], pagination: { hasMore: false } } }),
    "/sender/edit": () => ({ status: 200, json: { ok: true } }),
  };
}

mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
  const caminho = new URL(url).pathname;
  const corpo = init?.body ? JSON.parse(String(init.body)) : null;
  chamadas.push({ caminho, corpo, token: (init?.headers as Record<string, string>)?.token ?? null });
  const responder = respostas[caminho];
  if (!responder) return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
  const { status, json } = responder(corpo);
  return new Response(JSON.stringify(json), { status });
});

function lotesCriados() {
  return chamadas.filter((c) => c.caminho === "/sender/advanced").map((c) => c.corpo!.messages as Record<string, unknown>[]);
}
function envios(status?: string) {
  return banco.tabelas.campanha_envios.filter((e) => !status || e.status === status);
}
function campanha() {
  return banco.tabelas.campanhas.find((c) => c.id === CAMP)!;
}

function novaCampanha(extra: Record<string, unknown> = {}) {
  banco.tabelas.campanhas.push({
    id: CAMP,
    titulo: "Black Friday — 15% OFF",
    mensagem: "🖤 BLACK FRIDAY FARMÁCIA PREÇO BOM!\n\nOlá, {{nome}}! 💚\n\n🎟️ CUPOM: BLACK15",
    clientes_alvo: "todos",
    filtro_json: null,
    agendada_para: new Date(TERCA_14H - 60_000).toISOString(),
    status: "agendada",
    enviada_em: null,
    motivo_pausa: null,
    midia_path: null,
    midia_mime: null,
    midia_tamanho: null,
    criado_em: new Date(TERCA_14H - 3600_000).toISOString(),
    criado_por: DONA,
    ...extra,
  });
}

beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: TERCA_14H });
  zerarBanco();
  chamadas = [];
  uazapiPadrao();
  banco.clientes = [
    { id: "c1", nome: "MARIA SOUZA", telefone: "(71) 99999-0001", origem_chat: "whatsapp" },
    { id: "c2", nome: "joão pedro", telefone: "71999990002", origem_chat: "whatsapp" },
    { id: "c3", nome: null, telefone: "5571999990003", origem_chat: "whatsapp" },
  ];
});

test("TESTE 1/10 — campanha de texto: mesmo payload de sempre, nenhum campo de imagem", async () => {
  novaCampanha();
  const r = await processarCampanhas();
  assert.equal(r.ok, true, r.acoes.join(" | "));
  const [lote] = lotesCriados();
  assert.equal(lote.length, 3);
  for (const m of lote) {
    assert.deepEqual(Object.keys(m).sort(), ["number", "text", "type"]);
    assert.equal(m.type, "text");
  }
  assert.equal(envios("agendado").length, 3);
  assert.equal(banco.tabelas.campanha_lotes[0].folder_id, "pasta-1");
});

test("TESTE 2/4/5 — campanha com imagem: foto + legenda personalizada numa mensagem só, mesma imagem pra todos", async () => {
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 200_000 });
  banco.arquivos.add(IMAGEM);

  await processarCampanhas();
  const [lote] = lotesCriados();
  assert.equal(lote.length, 3, "uma mensagem por pessoa (não duas)");
  const porNumero = Object.fromEntries(lote.map((m) => [m.number, m]));
  for (const m of lote) {
    assert.equal(m.type, "image");
    assert.match(String(m.file), /^https:\/\/.*campanha-midia\/.*\.jpg\?token=assinado/);
    assert.equal(m.file, lote[0].file, "mesma imagem, sem upload por destinatário");
  }
  assert.match(String(porNumero["5571999990001"].text), /^🖤 BLACK FRIDAY FARMÁCIA PREÇO BOM!\n\nOlá, Maria! 💚\n\n🎟️ CUPOM: BLACK15/);
  assert.match(String(porNumero["5571999990002"].text), /Olá, João! 💚/);
  assert.ok(!String(porNumero["5571999990003"].text).includes("{{nome}}"), "sem nome: variável não vaza");
  assert.ok(String(porNumero["5571999990001"].text).endsWith(CFG.rodapeOptout));
  // Link gerado na hora do lote, válido por 30 dias (não o da criação da campanha).
  assert.match(String(lote[0].file), new RegExp(`validade=${30 * 24 * 60 * 60}`));
  // Autenticação: token da instância vai no cabeçalho, nunca no corpo.
  const envio = chamadas.find((c) => c.caminho === "/sender/advanced")!;
  assert.equal(envio.token, "token-de-teste");
  assert.ok(!JSON.stringify(envio.corpo).includes("token-de-teste"));
});

test("imagem sumiu do armazenamento: campanha pausada com motivo, nada é enviado", async () => {
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 200_000 });
  await processarCampanhas();
  assert.equal(lotesCriados().length, 0);
  assert.equal(envios().length, 0);
  assert.equal(campanha().status, "pausada");
  assert.match(String(campanha().motivo_pausa), /imagem desta campanha não foi encontrada/);
});

test("TESTE 6 — agendada para mais tarde: só sai quando chega a hora", async () => {
  novaCampanha({ agendada_para: new Date(TERCA_14H + 2 * 3600_000).toISOString() });
  await processarCampanhas();
  assert.equal(lotesCriados().length, 0, "antes do horário, nada");
  mock.timers.setTime(TERCA_14H + 2 * 3600_000 + 60_000);
  await processarCampanhas();
  assert.equal(lotesCriados().length, 1, "no horário, o lote sai");
});

test("fora da janela (domingo): nenhum lote, mesmo com imagem", async () => {
  mock.timers.setTime(new Date("2026-11-22T14:00:00-03:00").getTime());
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 1, agendada_para: null });
  banco.arquivos.add(IMAGEM);
  await processarCampanhas();
  assert.equal(lotesCriados().length, 0);
});

test("TESTE 7 — uazapi fora do ar (500): sem duplicar; lote só é refeito depois de confirmar que não existe", async () => {
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 1 });
  banco.arquivos.add(IMAGEM);
  respostas["/sender/advanced"] = () => ({ status: 500, json: { error: "internal" } });

  await processarCampanhas();
  assert.equal(lotesCriados().length, 1);
  assert.equal(banco.tabelas.campanha_lotes[0].status, "criando", "pode ter sido criado: fica em observação");

  // Atualizou a página / n8n bateu de novo: não cria outro lote nem reenvia.
  await processarCampanhas();
  await processarCampanhas();
  assert.equal(lotesCriados().length, 1, "nenhum disparo duplicado");

  // 6 min depois, a uazapi não tem a pasta: lote descartado, pessoas liberadas.
  uazapiPadrao();
  mock.timers.setTime(TERCA_14H + 6 * 60_000);
  await processarCampanhas();
  assert.equal(banco.tabelas.campanha_lotes[0].status, "falhou");
  // Mesma rodada já monta o lote novo com as mesmas pessoas — cada uma UMA vez.
  const lotes = lotesCriados();
  assert.equal(lotes.length, 2);
  assert.equal(new Set(lotes[1].map((m) => m.number)).size, 3);
  assert.equal(banco.tabelas.campanha_envios.length, 3, "um registro por pessoa (campanha + telefone)");
});

test("TESTE 7 — pasta reencontrada depois do timeout: adota a pasta, não recria", async () => {
  novaCampanha();
  respostas["/sender/advanced"] = () => ({ status: 504, json: {} });
  await processarCampanhas();
  const loteId = banco.tabelas.campanha_lotes[0].id as string;

  uazapiPadrao();
  respostas["/sender/listfolders"] = () => ({ status: 200, json: [{ id: "pasta-x", info: `Black · crm-lote:${loteId}`, status: "sending" }] });
  await processarCampanhas();
  assert.equal(banco.tabelas.campanha_lotes[0].folder_id, "pasta-x");
  assert.equal(lotesCriados().length, 1, "não mandou de novo");
});

test("TESTE 7 — uazapi recusa o lote (400): campanha pausada com o erro, ninguém fica preso na fila", async () => {
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 1 });
  banco.arquivos.add(IMAGEM);
  respostas["/sender/advanced"] = () => ({ status: 400, json: { error: "invalid file url" } });
  await processarCampanhas();
  assert.equal(campanha().status, "pausada");
  assert.match(String(campanha().motivo_pausa), /invalid file url/);
  assert.equal(envios("agendado").length, 0);
  assert.equal(envios("cancelado").length, 3);
});

test("TESTE 8 — status só com evidência: enviado/falha da uazapi, entregue/lido só com recibo", async () => {
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 1 });
  banco.arquivos.add(IMAGEM);
  await processarCampanhas();

  respostas["/sender/listfolders"] = () => ({ status: 200, json: [{ id: "pasta-1", info: "", status: "sending" }] });
  respostas["/sender/listmessages"] = () => ({
    status: 200,
    json: {
      messages: [
        { messageid: "m1", chatid: "5571999990001@s.whatsapp.net", status: "Sent", messageTimestamp: TERCA_14H + 1000 },
        { messageid: "m2", chatid: "557199990002@s.whatsapp.net", status: "Failed", error: "media download failed" },
        { messageid: null, chatid: "5571999990003@s.whatsapp.net", status: "Queued" },
      ],
      pagination: { hasMore: false },
    },
  });
  await processarCampanhas();
  const porTel = Object.fromEntries(envios().map((e) => [e.telefone, e]));
  assert.equal(porTel["5571999990001"].status, "enviado");
  assert.equal(porTel["5571999990001"].message_id, "m1");
  assert.equal(porTel["5571999990001"].entregue_em, null, "enviado não é entregue");
  assert.equal(porTel["5571999990002"].status, "falhou", "achado mesmo sem o 9º dígito");
  assert.equal(porTel["5571999990002"].erro, "media download failed");
  assert.equal(porTel["5571999990003"].status, "agendado", "na fila não vira enviado");

  await registrarRecibo(["m1"], "Delivered", new Date(TERCA_14H + 5000));
  assert.ok(envios().find((e) => e.message_id === "m1")!.entregue_em);
  assert.equal(envios().find((e) => e.message_id === "m1")!.lido_em, null);
  await registrarRecibo(["m1"], "Read", new Date(TERCA_14H + 9000));
  assert.ok(envios().find((e) => e.message_id === "m1")!.lido_em);
  await registrarRecibo(["m1"], "Sent", new Date());
  assert.ok(envios().find((e) => e.message_id === "m1")!.lido_em, "nunca regride");
});

test("TESTE 11 — pausa: lote parado na uazapi e nenhum lote novo enquanto pausada", async () => {
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 1 });
  banco.arquivos.add(IMAGEM);
  await processarCampanhas();
  respostas["/sender/listfolders"] = () => ({ status: 200, json: [{ id: "pasta-1", info: "", status: "sending" }] });
  respostas["/sender/listmessages"] = () => ({
    status: 200,
    json: { messages: [{ chatid: "5571999990001@s.whatsapp.net", status: "Queued" }], pagination: { hasMore: false } },
  });

  campanha().status = "pausada";
  await processarCampanhas();
  const parar = chamadas.filter((c) => c.caminho === "/sender/edit");
  assert.deepEqual(parar.map((c) => c.corpo), [{ folder_id: "pasta-1", action: "stop" }]);
  assert.equal(banco.tabelas.campanha_lotes[0].status, "pausado");

  mock.timers.setTime(TERCA_14H + 3600_000);
  await processarCampanhas();
  assert.equal(lotesCriados().length, 1, "campanha pausada não ganha lote novo");
});

test("retomar lote com imagem pausado há quase 30 dias: lote recriado com link novo, sem repetir quem recebeu", async () => {
  novaCampanha({ midia_path: IMAGEM, midia_mime: "image/jpeg", midia_tamanho: 1 });
  banco.arquivos.add(IMAGEM);
  await processarCampanhas();
  const lote = banco.tabelas.campanha_lotes[0];
  lote.status = "pausado";
  envios().find((e) => e.telefone === "5571999990001")!.status = "enviado";

  // 29 dias depois, a dona clica em Retomar.
  mock.timers.setTime(TERCA_14H + 29 * 24 * 3600_000); // quarta, 14h
  respostas["/sender/listfolders"] = () => ({ status: 200, json: [{ id: "pasta-1", info: "", status: "paused" }] });
  respostas["/sender/listmessages"] = () => ({
    status: 200,
    json: { messages: [{ chatid: "5571999990002@s.whatsapp.net", status: "Queued" }], pagination: { hasMore: false } },
  });
  await processarCampanhas();
  assert.deepEqual(chamadas.filter((c) => c.caminho === "/sender/edit").map((c) => c.corpo!.action), ["delete"]);
  assert.equal(lote.status, "cancelado");

  respostas["/sender/listfolders"] = () => ({ status: 200, json: [] });
  await processarCampanhas();
  const lotes = lotesCriados();
  assert.equal(lotes.length, 2);
  assert.deepEqual(lotes[1].map((m) => m.number).sort(), ["5571999990002", "5571999990003"], "quem já recebeu não recebe de novo");
});

test("sem WhatsApp (conferido na uazapi): registrado e fora do lote", async () => {
  banco.clientes.push({ id: "c4", nome: "Fixo", telefone: "7133334444", origem_chat: "whatsapp" });
  novaCampanha();
  await processarCampanhas();
  assert.equal(lotesCriados()[0].length, 3);
  assert.equal(envios("sem_whatsapp").length, 1);
});
