import { test } from "node:test";
import assert from "node:assert/strict";
import { eventoDoAvisoDePedido } from "../src/lib/mensagens/eventos-pedido.ts";
import { variantesTelefoneBr } from "../src/lib/telefone.ts";

test("cada etapa confirmada gera o aviso certo", () => {
  assert.equal(eventoDoAvisoDePedido("novo", "separando", false), "pedido_separando");
  assert.equal(eventoDoAvisoDePedido("separando", "pronto", true), "pedido_pronto_entrega");
  assert.equal(eventoDoAvisoDePedido("separando", "pronto", false), "pedido_pronto_retirada");
  assert.equal(eventoDoAvisoDePedido("pronto", "entregue", true), "pedido_entregue");
  assert.equal(eventoDoAvisoDePedido("novo", "entregue", false), "pedido_entregue");
});

test("voltar o cartão nunca manda mensagem", () => {
  assert.equal(eventoDoAvisoDePedido("entregue", "pronto", false), null);
  assert.equal(eventoDoAvisoDePedido("separando", "novo", false), null);
  assert.equal(eventoDoAvisoDePedido("pronto", "pronto", false), null);
  assert.equal(eventoDoAvisoDePedido("xyz", "pronto", false), null);
});

test("variações do telefone (55 e 9º dígito), igual ao banco", () => {
  const v = variantesTelefoneBr("+55 71 9965-4233");
  for (const esperado of ["557199654233", "7199654233", "71999654233", "5571999654233"]) {
    assert.ok(v.includes(esperado), esperado);
  }
  assert.ok(variantesTelefoneBr("(71) 99965-4233").includes("557199654233"));
  // Fixo (começa com 3) não ganha 9
  assert.ok(!variantesTelefoneBr("557130341900").includes("5571930341900"));
  assert.deepEqual(variantesTelefoneBr(""), []);
});
