/**
 * Rotas novas da campanha com imagem (upload/remoção e "Enviar teste"),
 * chamadas direto com Request de verdade. Login, banco e uazapi simulados.
 */
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { banco, zerarBanco } from "./apoio/supabase-falso.ts";
import { sessao } from "./apoio/auth-falso.ts";
import * as midia from "../src/app/api/campanhas/midia/route.ts";
import * as teste from "../src/app/api/campanhas/teste/route.ts";

process.env.UAIZAP_BASE_URL = "https://farmacia-teste.uazapi.com";
process.env.UAIZAP_API_KEY = "token-de-teste";

const CAMP = "11111111-1111-4111-8111-111111111111";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

let chamadas: { caminho: string; corpo: Record<string, unknown> }[] = [];
let respostaUazapi = { status: 200, json: { messageid: "3EB0ABC", response: { status: "success" } } as unknown };

mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
  chamadas.push({ caminho: new URL(url).pathname, corpo: JSON.parse(String(init?.body ?? "{}")) });
  return new Response(JSON.stringify(respostaUazapi.json), { status: respostaUazapi.status });
});

function upload(bytes: Uint8Array, tipo: string, campanhaId = CAMP) {
  const form = new FormData();
  form.append("campanha_id", campanhaId);
  form.append("arquivo", new File([bytes as unknown as BlobPart], "promo.jpg", { type: tipo }));
  return midia.POST(new Request("http://crm/api/campanhas/midia", { method: "POST", body: form }));
}

let contador = 0;
function enviarTeste(corpo: Record<string, unknown>) {
  return teste.POST(
    new Request("http://crm/api/campanhas/teste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envio_id: `00000000-0000-4000-8000-${String(++contador).padStart(12, "0")}`, ...corpo }),
    })
  );
}

beforeEach(() => {
  zerarBanco();
  chamadas = [];
  sessao.papel = "dona";
  respostaUazapi = { status: 200, json: { messageid: "3EB0ABC", response: { status: "success" } } };
});

test("upload: JPG válido vai pra pasta da campanha com nome aleatório", async () => {
  const res = await upload(JPEG, "image/jpeg");
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.match(json.midia_path, new RegExp(`^${CAMP}/[0-9a-f-]{36}\\.jpg$`));
  assert.equal(json.midia_mime, "image/jpeg");
  assert.ok(banco.arquivos.has(json.midia_path));
});

test("upload: arquivo disfarçado de imagem é recusado (assinatura não bate)", async () => {
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
  assert.equal((await upload(exe, "image/jpeg")).status, 415);
  const svg = new TextEncoder().encode("<svg onload=alert(1)></svg>");
  assert.equal((await upload(svg, "image/png")).status, 415);
  assert.equal(banco.arquivos.size, 0);
});

test("upload: acima de 5 MB é recusado", async () => {
  const grande = new Uint8Array(5 * 1024 * 1024 + 1);
  grande.set(JPEG);
  assert.equal((await upload(grande, "image/jpeg")).status, 413);
});

test("upload: campanha já salva não troca de imagem", async () => {
  banco.tabelas.campanhas.push({ id: CAMP });
  assert.equal((await upload(JPEG, "image/jpeg")).status, 409);
});

test("TESTE 12 — só a dona sobe/remove imagem e envia teste", async () => {
  sessao.papel = "funcionaria";
  await assert.rejects(() => upload(JPEG, "image/jpeg"), /NEXT_REDIRECT/);
  await assert.rejects(() => enviarTeste({ numero: "71999990001", mensagem: "oi", midia_path: null }), /NEXT_REDIRECT/);
  sessao.papel = null;
  await assert.rejects(() => upload(JPEG, "image/jpeg"), /NEXT_REDIRECT/);
  assert.equal(chamadas.length, 0);
});

test("TESTE 9 — remover antes de salvar apaga o arquivo; imagem de campanha salva não é apagada", async () => {
  const { midia_path } = await (await upload(JPEG, "image/jpeg")).json();
  const apagar = (caminho: string) =>
    midia.DELETE(new Request("http://crm/api/campanhas/midia", { method: "DELETE", body: JSON.stringify({ midia_path: caminho }) }));

  banco.tabelas.campanhas.push({ id: CAMP, midia_path });
  assert.equal((await apagar(midia_path)).status, 409);
  assert.ok(banco.arquivos.has(midia_path));

  banco.tabelas.campanhas = [];
  assert.equal((await apagar(midia_path)).status, 200);
  assert.ok(!banco.arquivos.has(midia_path));

  assert.equal((await apagar("../../branding/logo.png")).status, 400, "caminho fora do padrão");
});

test("TESTE 4/5 — teste com imagem: /send/media com foto + legenda personalizada; nada na campanha", async () => {
  const { midia_path } = await (await upload(JPEG, "image/jpeg")).json();
  const res = await enviarTeste({ numero: "(71) 99999-0001", nome: "joão", mensagem: "Olá, {{nome}}! 💚\n🎟️ *BLACK15*", midia_path });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.endpoint, "/send/media");
  assert.equal(json.messageid, "3EB0ABC");

  const envio = chamadas.at(-1)!;
  assert.equal(envio.caminho, "/send/media");
  assert.equal(envio.corpo.number, "5571999990001");
  assert.equal(envio.corpo.type, "image");
  assert.match(String(envio.corpo.file), /campanha-midia\/.*validade=3600/);
  assert.equal(String(envio.corpo.text).split("\n\nPara não")[0], "Olá, João! 💚\n🎟️ *BLACK15*");
  // Teste não vira envio da campanha nem conta na cota.
  assert.equal(banco.tabelas.campanha_envios.length, 0);
  assert.equal(banco.tabelas.campanha_lotes.length, 0);
  // Auditoria sem o número inteiro.
  const log = banco.tabelas.audit_log.at(-1)!;
  assert.equal(log.acao, "campanha_teste_enviado");
  assert.ok(!JSON.stringify(log).includes("99999-0001") && !JSON.stringify(log).includes("5571999990001"));
});

test("teste só de texto usa /send/text; resposta nunca devolve o token", async () => {
  respostaUazapi = { status: 200, json: { messageid: "X1", token: "token-de-teste" } };
  const json = await (await enviarTeste({ numero: "71999990001", mensagem: "Oi {{nome}}", midia_path: null })).json();
  assert.equal(chamadas.at(-1)!.caminho, "/send/text");
  assert.equal(chamadas.at(-1)!.corpo.type, "text");
  assert.ok(!JSON.stringify(json).includes("token-de-teste"));
});

test("TESTE 7 — falha da uazapi no teste aparece com o motivo", async () => {
  respostaUazapi = { status: 401, json: { error: "invalid token" } };
  const res = await enviarTeste({ numero: "71999990001", mensagem: "Oi", midia_path: null });
  assert.equal(res.status, 502);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.match(json.erro, /token/);
});

test("teste: número inválido, imagem inexistente, limite de testes e envio repetido", async () => {
  // Janela nova do limitador (6 testes a cada 10 minutos por usuária).
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 60 * 60_000 });

  assert.equal((await enviarTeste({ numero: "123", mensagem: "Oi", midia_path: null })).status, 400);
  const fantasma = `${CAMP}/22222222-2222-4222-8222-222222222222.jpg`;
  assert.equal((await enviarTeste({ numero: "71999990001", mensagem: "", midia_path: fantasma })).status, 404);

  const corpo = JSON.stringify({ envio_id: "99999999-9999-4999-8999-999999999999", numero: "71999990001", mensagem: "Oi", midia_path: null });
  const pedir = () => teste.POST(new Request("http://crm/api/campanhas/teste", { method: "POST", body: corpo }));
  assert.equal((await pedir()).status, 200);
  assert.equal((await pedir()).status, 409, "duplo clique não manda duas vezes");
  const enviadosAntes = chamadas.length;

  assert.equal((await enviarTeste({ numero: "71999990001", mensagem: "Oi", midia_path: null })).status, 200); // 5º
  assert.equal((await enviarTeste({ numero: "71999990001", mensagem: "Oi", midia_path: null })).status, 200); // 6º
  assert.equal((await enviarTeste({ numero: "71999990001", mensagem: "Oi", midia_path: null })).status, 429, "7º em 10 min é barrado");
  assert.equal(chamadas.length, enviadosAntes + 2);

  mock.timers.setTime(Date.now() + 11 * 60_000);
  assert.equal((await enviarTeste({ numero: "71999990001", mensagem: "Oi", midia_path: null })).status, 200, "libera depois de 10 min");
  mock.timers.reset();
});
