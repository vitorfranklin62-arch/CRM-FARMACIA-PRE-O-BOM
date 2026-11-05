import { test } from "node:test";
import assert from "node:assert/strict";
import {
  camposPausaPorResposta,
  estadoIa,
  iaImpedida,
  minutosDePausa,
  proximaExecucao22h,
  rotuloMotivo,
} from "../src/lib/ia/estado.ts";

const agora = new Date("2026-11-05T15:00:00Z");
const daqui = (min: number) => new Date(agora.getTime() + min * 60_000).toISOString();

test("estados básicos", () => {
  assert.equal(estadoIa({ status: "aberta" }, agora), "IA_ATIVA");
  assert.equal(estadoIa({ status: "fechada" }, agora), "ENCERRADA");
  assert.equal(estadoIa({ status: "aguardando_humano", ia_pausada_ate: null }, agora), "HUMANO_ASSUMIU");
  assert.equal(estadoIa({ status: "aguardando_humano", ia_pausada_ate: daqui(5) }, agora), "PAUSA_TEMPORARIA");
});

test("pausa vencida volta a ser IA ativa (não trava pra sempre)", () => {
  assert.equal(estadoIa({ status: "aguardando_humano", ia_pausada_ate: daqui(-1) }, agora), "IA_ATIVA");
  assert.equal(iaImpedida({ status: "aguardando_humano", ia_pausada_ate: daqui(-1) }, agora), false);
});

test("número bloqueado vence qualquer outro estado", () => {
  assert.equal(estadoIa({ status: "aberta", bloqueada: true }, agora), "BLOQUEADA");
  assert.equal(iaImpedida({ status: "aberta", bloqueada: true }, agora), true);
});

test("resposta pelo CRM gera pausa com prazo, motivo e ator", () => {
  const c = camposPausaPorResposta(10, "usuario:abc", agora);
  assert.equal(c.status, "aguardando_humano");
  assert.equal(c.ia_motivo, "resposta_crm");
  assert.equal(c.ia_ator, "usuario:abc");
  assert.equal(c.ia_pausada_ate, daqui(10));
});

test("minutos de pausa: padrão 10 e limites seguros", () => {
  assert.equal(minutosDePausa(null), 10);
  assert.equal(minutosDePausa("abc"), 10);
  assert.equal(minutosDePausa("0"), 10);
  assert.equal(minutosDePausa("30"), 30);
  assert.equal(minutosDePausa("999999"), 720);
});

test("próxima execução às 22h de Salvador (01:00 UTC)", () => {
  // 15:00 UTC = 12:00 em Salvador → hoje às 22h
  assert.equal(proximaExecucao22h(agora).toISOString(), "2026-11-06T01:00:00.000Z");
  // 21:59 em Salvador → ainda hoje
  assert.equal(proximaExecucao22h(new Date("2026-11-06T00:59:00Z")).toISOString(), "2026-11-06T01:00:00.000Z");
  // 22:00 em ponto → amanhã
  assert.equal(proximaExecucao22h(new Date("2026-11-06T01:00:00Z")).toISOString(), "2026-11-07T01:00:00.000Z");
  // 23:30 em Salvador (02:30 UTC do dia seguinte) → amanhã às 22h
  assert.equal(proximaExecucao22h(new Date("2026-11-06T02:30:00Z")).toISOString(), "2026-11-07T01:00:00.000Z");
});

test("motivos têm texto pra tela", () => {
  assert.equal(rotuloMotivo("resposta_crm"), "alguém da equipe respondeu");
  assert.equal(rotuloMotivo(null), "sem motivo registrado");
  assert.equal(rotuloMotivo("desconhecido"), "desconhecido");
});
