import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoPedido, primeiroNome, renderizarTemplate, validarTemplate, variaveisUsadas } from "../src/lib/mensagens/template.ts";

test("variáveis são preenchidas", () => {
  const t = renderizarTemplate("Olá, {primeiro_nome}! Pedido #{numero_pedido} na {farmacia}.", {
    primeiro_nome: "Ana",
    numero_pedido: "3F9A1C",
    farmacia: "Farmácia Preço Bom",
  });
  assert.equal(t, "Olá, Ana! Pedido #3F9A1C na Farmácia Preço Bom.");
});

test("sem nome, a frase é ajustada (nada de 'Olá, !')", () => {
  assert.equal(renderizarTemplate("Olá, {primeiro_nome}! 💚", { primeiro_nome: "" }), "Olá! 💚");
  assert.equal(renderizarTemplate("{primeiro_nome}, seu pedido saiu.", {}), "Seu pedido saiu.");
  assert.equal(renderizarTemplate("Boa notícia, {primeiro_nome}! Tudo certo.", {}), "Boa notícia! Tudo certo.");
});

test("primeiro nome: só nome de verdade, capitalizado", () => {
  assert.equal(primeiroNome("ana maria souza"), "Ana");
  assert.equal(primeiroNome("ÉRICA"), "Érica");
  assert.equal(primeiroNome("557199654233"), "");
  assert.equal(primeiroNome(null), "");
});

test("validação recusa variável inexistente e chave solta", () => {
  assert.equal(validarTemplate("pedido_separando", "Oi {primeiro_nome}").ok, true);
  const r = validarTemplate("pedido_separando", "Oi {nome}");
  assert.equal(r.ok, false);
  assert.equal(validarTemplate("pedido_separando", "Oi {primeiro_nome").ok, false);
  assert.equal(validarTemplate("pedido_separando", "   ").ok, false);
  assert.equal(validarTemplate("chave_que_nao_existe", "oi").ok, false);
  assert.equal(validarTemplate("encomenda_chegou", "{produto}{quantidade} chegou").ok, true);
});

test("todos os textos padrão da migração são válidos", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/20261105_mensagens_automaticas_pedidos.sql", import.meta.url), "utf8");
  const linhas = Array.from(sql.matchAll(/\('([a-z_]+)', '[^']+',\s*'[^']*',\s*E'((?:[^']|'')*)'/g));
  assert.ok(linhas.length >= 6, "esperava 6 textos padrão");
  for (const [, chave, texto] of linhas) {
    const conteudo = texto.replace(/\\n/g, "\n");
    assert.deepEqual(validarTemplate(chave, conteudo), { ok: true }, chave);
    assert.ok(!/remédio|medicamento|receita|tratamento/i.test(conteudo), `${chave} não pode citar dado de saúde`);
  }
  assert.deepEqual(variaveisUsadas("{a}{b}{a}"), ["a", "b"]);
});

test("código do pedido é curto e estável", () => {
  assert.equal(codigoPedido("3f9a1c2b-0000-4000-8000-000000000000"), "3F9A1C");
});
