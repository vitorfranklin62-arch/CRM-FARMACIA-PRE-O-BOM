/**
 * Motor dos textos automáticos (tabela `mensagens_automaticas`): troca as
 * variáveis {assim} pelos dados reais e valida o texto antes de salvar.
 * Sem imports com "@/" de propósito: este arquivo roda nos testes do Node.
 */

/** Variáveis aceitas em cada mensagem automática. */
export const VARIAVEIS_POR_CHAVE: Record<string, readonly string[]> = {
  pedido_recebido: ["primeiro_nome", "numero_pedido", "farmacia"],
  pedido_separando: ["primeiro_nome", "numero_pedido", "farmacia"],
  pedido_pronto_entrega: ["primeiro_nome", "numero_pedido", "farmacia"],
  pedido_pronto_retirada: ["primeiro_nome", "numero_pedido", "farmacia"],
  pedido_entregue: ["primeiro_nome", "numero_pedido", "farmacia"],
  encomenda_chegou: ["primeiro_nome", "produto", "quantidade", "farmacia"],
};

/** Exemplo usado na pré-visualização do painel. */
export const EXEMPLO_VARIAVEIS: Record<string, string> = {
  primeiro_nome: "Ana",
  numero_pedido: "3F9A1C",
  farmacia: "Farmácia Preço Bom",
  produto: "Dipirona 1g",
  quantidade: " (2 unidades)",
};

const REGEX_VARIAVEL = /\{([a-z_]+)\}/g;
/** Letra (com acentos do português). */
const LETRA = "A-Za-zÀ-ÖØ-öø-ÿ";

export function variaveisUsadas(texto: string): string[] {
  return Array.from(new Set(Array.from(texto.matchAll(REGEX_VARIAVEL), (m) => m[1])));
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string };

/** Confere o texto antes de salvar: tamanho e só variáveis conhecidas. */
export function validarTemplate(chave: string, texto: string): ResultadoValidacao {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: "O texto não pode ficar vazio." };
  if (limpo.length > 1500) return { ok: false, erro: "O texto passou de 1500 caracteres. Mensagens curtas funcionam melhor no WhatsApp." };
  const permitidas = VARIAVEIS_POR_CHAVE[chave];
  if (!permitidas) return { ok: false, erro: "Mensagem automática desconhecida." };
  const invalidas = variaveisUsadas(limpo).filter((v) => !permitidas.includes(v));
  if (invalidas.length > 0) {
    return {
      ok: false,
      erro: `Variável que não existe nesta mensagem: ${invalidas.map((v) => `{${v}}`).join(", ")}. Use só: ${permitidas
        .map((v) => `{${v}}`)
        .join(", ")}.`,
    };
  }
  if (/[{}]/.test(limpo.replace(REGEX_VARIAVEL, ""))) {
    return { ok: false, erro: "Tem uma chave { ou } sobrando. As variáveis são escritas assim: {primeiro_nome}." };
  }
  return { ok: true };
}

/**
 * Primeiro nome só quando é nome de verdade. Contato sem nome no WhatsApp vira
 * o próprio número no cadastro — "Olá, 5571999…!" seria pior que sem nome.
 */
export function primeiroNome(nome: string | null | undefined): string {
  const n = (nome ?? "").trim();
  if (!new RegExp(`[${LETRA}]`).test(n)) return "";
  const primeiro = n.split(/\s+/)[0];
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

/** Código curto do pedido, o mesmo que aparece no cartão do quadro. */
export function codigoPedido(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/**
 * Troca as variáveis. Sem primeiro nome, a frase é ajustada em vez de ficar
 * "Olá, !" — ex.: "Olá, {primeiro_nome}! 💚" → "Olá! 💚" e
 * "{primeiro_nome}, seu pedido…" → "Seu pedido…".
 */
export function renderizarTemplate(texto: string, variaveis: Record<string, string | null | undefined>): string {
  let saida = texto;
  if (!variaveis.primeiro_nome) {
    saida = saida
      .replace(/,\s*\{primeiro_nome\}/g, "")
      .replace(new RegExp(`\\{primeiro_nome\\},?\\s*([${LETRA}])`, "g"), (_m, letra: string) => letra.toLocaleUpperCase("pt-BR"))
      .replace(/\{primeiro_nome\}\s*/g, "");
  }
  saida = saida.replace(REGEX_VARIAVEL, (_m, nome: string) => variaveis[nome] ?? "");
  return saida.replace(/[ \t]{2,}/g, " ").trim();
}
