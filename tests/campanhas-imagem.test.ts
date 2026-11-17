import { test } from "node:test";
import assert from "node:assert/strict";
import { CFG, itemDaUazapi, montarTexto, variaveisDesconhecidas } from "../src/lib/campanhas/regras.ts";
import { caminhoDeImagemValido, tipoRealDaImagem } from "../src/lib/campanhas/midia-validacao.ts";
import { formatarWhatsapp } from "../src/lib/campanhas/formatacao-whatsapp.ts";

const LINK = "https://exemplo.supabase.co/storage/v1/object/sign/campanha-midia/a/b.jpg?token=x";
const BLACK_FRIDAY = "🖤 BLACK FRIDAY FARMÁCIA PREÇO BOM!\n\nOlá, {{nome}}! 💚\n\nVocê acaba de ganhar um presente especial!\n\n🎁 15% OFF em qualquer compra na loja!\n\n🎟️ CUPOM: BLACK15\n\nAproveite nossas ofertas!";

test("TESTE 1/10 — campanha só de texto sai exatamente como antes", () => {
  const texto = montarTexto("Oi, {{nome}}! Promoção hoje.", "MARIA SILVA");
  assert.equal(texto, "Oi, Maria! Promoção hoje." + CFG.rodapeOptout);
  assert.deepEqual(itemDaUazapi("5571999990000", texto, null), { number: "5571999990000", type: "text", text: texto });
});

test("TESTE 2/4 — com imagem: UMA mensagem de foto com a legenda dentro (nunca documento)", () => {
  const item = itemDaUazapi("5571999990000", "Legenda", LINK);
  assert.deepEqual(item, { number: "5571999990000", type: "image", file: LINK, text: "Legenda" });
  assert.notEqual(item.type, "document");
});

test("TESTE 5 — personalização por destinatário não mistura nomes", () => {
  const maria = montarTexto(BLACK_FRIDAY, "maria souza");
  const joao = montarTexto(BLACK_FRIDAY, "JOÃO");
  assert.ok(maria.includes("Olá, Maria! 💚"));
  assert.ok(joao.includes("Olá, João! 💚"));
  assert.ok(!maria.includes("João") && !joao.includes("Maria"));
  const itens = [itemDaUazapi("1", maria, LINK), itemDaUazapi("2", joao, LINK)];
  // Mesma imagem (sem novo upload por pessoa), legenda de cada um.
  assert.equal(itens[0].type === "image" && itens[1].type === "image" && itens[0].file === itens[1].file, true);
  assert.notEqual(itens[0].text, itens[1].text);
});

test("legenda preserva emojis, quebras de linha e caracteres especiais", () => {
  const texto = montarTexto(BLACK_FRIDAY, "Ana");
  assert.ok(texto.startsWith("🖤 BLACK FRIDAY FARMÁCIA PREÇO BOM!\n\nOlá, Ana! 💚\n\n"));
  assert.ok(texto.includes("🎟️ CUPOM: BLACK15"));
  assert.ok(texto.endsWith("Para não receber mais, responda SAIR."));
  // O JSON enviado à uazapi devolve o mesmo texto, byte a byte.
  assert.equal(JSON.parse(JSON.stringify(itemDaUazapi("1", texto, LINK))).text, texto);
});

test("somente imagem: legenda vira só o rodapé de descadastro, sem linhas em branco no começo", () => {
  assert.equal(montarTexto("", "Ana"), CFG.rodapeOptout.trim());
  assert.equal(montarTexto("   ", null), CFG.rodapeOptout.trim());
});

test("cliente sem nome: frase reescrita; prévia com saudação fixa é estável", () => {
  assert.equal(montarTexto("Olá, {{nome}}! Oferta.", null, { saudacaoFixa: "Olá" }), "Olá! Oferta." + CFG.rodapeOptout);
  const a = montarTexto("{{saudacao}}, {{nome}}", "Bia", { saudacaoFixa: "Olá" });
  assert.equal(a, montarTexto("{{saudacao}}, {{nome}}", "Bia", { saudacaoFixa: "Olá" }));
  // Sorteio: duas {{saudacao}} na mesma mensagem saem iguais.
  for (let i = 0; i < 20; i++) {
    const t = montarTexto("{{saudacao}} / {{saudacao}}", "Bia");
    const [x, y] = t.split(CFG.rodapeOptout)[0].split(" / ");
    assert.equal(x, y);
  }
});

test("variáveis desconhecidas são apontadas ({{cupom}} iria literal pro cliente)", () => {
  assert.deepEqual(variaveisDesconhecidas("Olá {{nome}}, {{ saudacao }}"), []);
  assert.deepEqual(variaveisDesconhecidas("Use {{cupom}} e {{Cupom}} {{data}}"), ["cupom", "data"]);
});

test("assinatura do arquivo: só JPG/PNG de verdade", () => {
  assert.equal(tipoRealDaImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(tipoRealDaImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(tipoRealDaImagem(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(tipoRealDaImagem(new Uint8Array([0x4d, 0x5a, 0x90, 0])), null); // .exe renomeado
  assert.equal(tipoRealDaImagem(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), null); // WEBP: convertido na tela
});

test("caminho da imagem: só {uuid}/{uuid}.jpg|png (nada de ../ ou outra pasta)", () => {
  const ok = "0b1d8e5a-1c2d-4e5f-8a9b-0c1d2e3f4a5b/9f8e7d6c-5b4a-4321-8fed-cba987654321.jpg";
  assert.equal(caminhoDeImagemValido(ok), true);
  assert.equal(caminhoDeImagemValido(ok.replace(".jpg", ".png")), true);
  assert.equal(caminhoDeImagemValido("../" + ok), false);
  assert.equal(caminhoDeImagemValido(ok.replace(".jpg", ".svg")), false);
  assert.equal(caminhoDeImagemValido("outra-pasta/arquivo.jpg"), false);
  assert.equal(caminhoDeImagemValido(null), false);
});

test("formatação do WhatsApp na prévia", () => {
  assert.deepEqual(formatarWhatsapp("*15% OFF* hoje"), [
    { tipo: "negrito", filhos: [{ tipo: "texto", texto: "15% OFF" }] },
    { tipo: "texto", texto: " hoje" },
  ]);
  assert.deepEqual(formatarWhatsapp("_a_ ~b~ ```c d```"), [
    { tipo: "italico", filhos: [{ tipo: "texto", texto: "a" }] },
    { tipo: "texto", texto: " " },
    { tipo: "tachado", filhos: [{ tipo: "texto", texto: "b" }] },
    { tipo: "texto", texto: " " },
    { tipo: "mono", texto: "c d" },
  ]);
  // Não formata: conta, marcador com espaço, marcador atravessando linha, e-mail/nome_composto.
  for (const literal of ["2*3*4", "* nada *", "*a\nb*", "joao_silva_123", "a*b"]) {
    assert.deepEqual(formatarWhatsapp(literal), [{ tipo: "texto", texto: literal }], literal);
  }
  // Aninhado e com emoji.
  assert.deepEqual(formatarWhatsapp("*🎁 _já_*"), [
    { tipo: "negrito", filhos: [{ tipo: "texto", texto: "🎁 " }, { tipo: "italico", filhos: [{ tipo: "texto", texto: "já" }] }] },
  ]);
  // Texto com "<script>" continua texto (a prévia nunca vira HTML).
  assert.deepEqual(formatarWhatsapp("<b>oi</b>"), [{ tipo: "texto", texto: "<b>oi</b>" }]);
});
