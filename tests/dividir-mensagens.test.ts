import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Código do nó "dividir mensagens1" do fluxo de atendimento no N8N (cópia
// oficial em n8n/prompts/dividir-mensagens.js). Roda aqui como o N8N roda:
// recebe $input e devolve os itens (um por balão do WhatsApp).
const codigo = readFileSync(new URL("../n8n/prompts/dividir-mensagens.js", import.meta.url), "utf8");
function baloes(output: string): string[] {
  const itens = new Function("$input", codigo)({ first: () => ({ json: { output } }) }) as { json: { texto: string } }[];
  return itens.map((i) => i.json.texto);
}

test("linha em branco separa os balões", () => {
  assert.deepEqual(baloes("Boa tarde!\n\nTenho sim, R$ 11,95."), ["Boa tarde!", "Tenho sim, R$ 11,95."]);
});

test("remove muleta de robô no começo (Perfeito/Ótimo/Entendi)", () => {
  assert.deepEqual(baloes("Ótimo, Cláudia 😊\n\nQual o endereço?"), ["Qual o endereço?"]);
  assert.deepEqual(baloes("Perfeito, Carlos! Vou separar 2 caixas."), ["Vou separar 2 caixas."]);
  assert.deepEqual(baloes("Entendi, Rosa Maria 😊\n\nEm gotas não tenho."), ["Em gotas não tenho."]);
});

test("não mexe em 'Entendi' no meio de uma frase de verdade", () => {
  assert.deepEqual(baloes("Entendi o que aconteceu, vou chamar o pessoal."), ["Entendi o que aconteceu, vou chamar o pessoal."]);
});

test("se a resposta era só a muleta, não manda balão vazio", () => {
  assert.deepEqual(baloes("Perfeito!"), ["Perfeito!"]);
});

test("markdown e travessão viram texto de WhatsApp", () => {
  assert.deepEqual(baloes("# Oi\n\nTenho sim — **R$ 11,95**"), ["Oi", "Tenho sim, *R$ 11,95*"]);
});

test("no máximo 3 balões; o resto vai junto no último", () => {
  assert.deepEqual(baloes("a\n\nb\n\nc\n\nd"), ["A", "B", "C\nD"]);
});

test("tempo de 'digitando...' proporcional ao tamanho, entre 1,5 s e 6 s", () => {
  const itens = new Function("$input", codigo)({ first: () => ({ json: { output: "Oi\n\n" + "x".repeat(400) } }) }) as { json: { delay_ms: number } }[];
  assert.equal(itens[0].json.delay_ms, 1500);
  assert.equal(itens[1].json.delay_ms, 6000);
});

test("balão que é só concordância some quando há outros balões", () => {
  assert.deepEqual(baloes("Beleza, Marcos 😄\n\nConfirmo: 1 Losartana, R$ 7,00. Posso fechar?"), ["Confirmo: 1 Losartana, R$ 7,00. Posso fechar?"]);
  assert.deepEqual(baloes("Certo!\n\nQual o bairro?"), ["Qual o bairro?"]);
  assert.deepEqual(baloes("Beleza, Marcos 😄"), ["Beleza, Marcos 😄"]);
  assert.deepEqual(baloes("Beleza, já separo aqui.\n\nQual o bairro?"), ["Beleza, já separo aqui.", "Qual o bairro?"]);
});

test("nome de produto em MAIÚSCULAS vira texto normal, siglas curtas ficam", () => {
  assert.deepEqual(baloes("Confirmo: 1 LOSARTANA POTASSICA EMS, R$ 7"), ["Confirmo: 1 Losartana potassica EMS, R$ 7"]);
  assert.deepEqual(baloes("Tenho CLONAZEPAM 2MG 30 CP por R$ 13,95"), ["Tenho Clonazepam 2mg 30 CP por R$ 13,95"]);
  assert.deepEqual(baloes("Chave Pix (CNPJ): 13549736000165"), ["Chave Pix (CNPJ): 13549736000165"]);
});

test("siglas como CNPJ e SAMU não viram minúsculas", () => {
  assert.deepEqual(baloes("Pix (CNPJ 13549736000165), dinheiro ou cartão."), ["Pix (CNPJ 13549736000165), dinheiro ou cartão."]);
  assert.deepEqual(baloes("Liga pro SAMU 192 agora, tá?"), ["Liga pro SAMU 192 agora, tá?"]);
});
