/**
 * Regras do disparo de campanhas: ritmo, tetos, janela de horário, limpeza de
 * telefone e montagem do texto. Veio do nó "Preparar campanhas"/"Montar fila"
 * do fluxo antigo do N8N, com os mesmos valores — agora versionado aqui.
 */

// ===========================================================================
// PAINEL DE CONTROLE — é aqui que se mexe pra afrouxar ou apertar o disparo.
// ===========================================================================
export const CFG = {
  // --- Ritmo entre uma mensagem e a próxima (segundos). A uazapi sorteia
  // dentro do intervalo; intervalo fixo é assinatura de robô.
  pausaMinSeg: 25,
  pausaMaxSeg: 75,

  // --- Tamanho de cada lote entregue à uazapi. Entre um lote e o próximo
  // fica uma parada longa (minutos, sorteada): manda um punhado, "larga o
  // celular", volta depois.
  loteTamanho: 20,
  pausaLongaMinMin: 4,
  pausaLongaMaxMin: 9,

  // --- Teto do dia, somando TODAS as campanhas.
  limiteDia: 250,

  // --- Janela de horário (hora de São Paulo) e dias da semana. 0 = domingo.
  // Mensagem de madrugada é o que mais rende denúncia.
  horaInicio: 8,
  horaFim: 20,
  diasPermitidos: [1, 2, 3, 4, 5, 6],

  // --- Disjuntor: N falhas seguidas no mesmo lote pausam a campanha.
  // Falha em série normalmente quer dizer instância caída ou número limitado.
  falhasSeguidasParaAbortar: 5,

  // --- Rodapé de descadastro. Dar uma saída fácil evita que o cliente use a
  // única outra saída que ele tem: denunciar como spam.
  rodapeOptout: "\n\nPara não receber mais, responda SAIR.",

  // --- {{saudacao}} sorteia da primeira lista. A segunda só entra quando o
  // cliente não tem nome no cadastro, aí a frase inteira é trocada.
  saudacoes: ["Oi", "Olá"],
  saudacoesSemNome: ["Oi, tudo bem?", "Olá, tudo bem?", "Oi!", "Olá!"],
} as const;

const FUSO = "America/Sao_Paulo";

/** Hora, dia da semana e data (AAAA-MM-DD) em São Paulo. */
function relogioSaoPaulo(quando: Date) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(quando)
      .map((p) => [p.type, p.value])
  );
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    diaSemana: dias.indexOf(partes.weekday),
    data: `${partes.year}-${partes.month}-${partes.day}`,
  };
}

export function dentroDaJanela(quando: Date = new Date()): boolean {
  const r = relogioSaoPaulo(quando);
  return (CFG.diasPermitidos as readonly number[]).includes(r.diaSemana) && r.hora >= CFG.horaInicio && r.hora < CFG.horaFim;
}

/** Segundos que faltam até a janela fechar hoje (0 se já está fora). */
export function segundosAteFimDaJanela(quando: Date = new Date()): number {
  if (!dentroDaJanela(quando)) return 0;
  const r = relogioSaoPaulo(quando);
  return (CFG.horaFim - r.hora) * 3600 - r.minuto * 60;
}

/** Meia-noite de hoje em São Paulo, em ISO. Brasil não tem horário de verão desde 2019, então -03:00 é fixo. */
export function inicioDoDiaSaoPaulo(quando: Date = new Date()): string {
  return new Date(`${relogioSaoPaulo(quando).data}T00:00:00-03:00`).toISOString();
}

// DDDs que existem de fato no Brasil. Sem esta conferência, um número
// estrangeiro de 11 dígitos ganha o 55 na frente e vira um "brasileiro"
// inventado — envio que nunca entrega e ainda conta como tentativa suspeita.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Telefone do cadastro → "55DDDNÚMERO", ou null se não for um telefone brasileiro plausível.
 * Celular antigo sem o 9º dígito (6-9 + 7 dígitos) é aceito como está: é assim que
 * o WhatsApp guarda muita conta brasileira, e o CRM recebe o número do próprio
 * WhatsApp. A checagem no /chat/check decide qual forma vale.
 */
export function telefoneDaCampanha(bruto: string | null | undefined): string | null {
  let d = String(bruto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!DDDS.has(Number(d.slice(0, 2)))) return null;

  const resto = d.slice(2);
  const celular = resto.length === 9 && resto[0] === "9";
  const celularAntigo = resto.length === 8 && /^[6-9]/.test(resto);
  const fixo = resto.length === 8 && /^[2-5]/.test(resto);
  if (!celular && !celularAntigo && !fixo) return null;

  return `55${d}`;
}

/**
 * Chave de comparação: DDD + 8 últimos dígitos. O mesmo celular com e sem o
 * 9º dígito vira UMA pessoa — ninguém recebe duas vezes por o número estar
 * gravado de um jeito no cadastro e de outro no registro de envio.
 */
export function chaveDoTelefone(numero: string): string {
  const local = numero.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return local.slice(0, 2) + local.slice(-8);
}

/**
 * Formas do mesmo número brasileiro com e sem o nono dígito. O WhatsApp
 * guarda contas antigas sem o 9 (chatid "557199373863"), então o número que
 * mandamos e o que volta no resultado podem não bater dígito a dígito.
 */
export function variantesDoTelefone(digitos: string): string[] {
  const d = digitos.replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") return [d, d.slice(0, 4) + d.slice(5)];
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4])) return [d, `${d.slice(0, 4)}9${d.slice(4)}`];
  return [d];
}

function sortear<T>(lista: readonly T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

export function sortearInteiro(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Primeiro nome limpo: tira emoji/pontuação das pontas ("-🇧🇷-Rodrigo" → "Rodrigo"),
 * descarta nome sem letra ("." → sem nome) e arruma caixa ("FRANKLIN" → "Franklin").
 */
// Construídos com RegExp porque a flag "u" (classes \p{L}) não passa no target do tsconfig.
const PONTAS_SEM_LETRA = new RegExp("^[^\\p{L}]+|[^\\p{L}\\p{N}]+$", "gu");
const TEM_LETRA = new RegExp("\\p{L}", "u");

function primeiroNome(nomeCliente: string | null | undefined): string {
  let primeiro = String(nomeCliente ?? "").trim().split(/\s+/)[0] || "";
  primeiro = primeiro.replace(PONTAS_SEM_LETRA, "");
  if (!TEM_LETRA.test(primeiro)) return "";
  if (primeiro === primeiro.toUpperCase() || primeiro === primeiro.toLowerCase()) {
    primeiro = primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
  }
  return primeiro;
}

/** Variáveis que o disparo de campanhas entende. Qualquer outra iria literal pro cliente. */
export const VARIAVEIS_CAMPANHA = ["nome", "saudacao"] as const;

/** Variáveis {{...}} da mensagem que o disparo NÃO sabe preencher (ex.: "{{cupom}}"). */
export function variaveisDesconhecidas(mensagem: string): string[] {
  const conhecidas = new Set<string>(VARIAVEIS_CAMPANHA);
  const achadas = Array.from(mensagem.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g), (m) => m[1].toLowerCase());
  return Array.from(new Set(achadas.filter((v) => !conhecidas.has(v))));
}

/**
 * Aplica {{nome}} e {{saudacao}} e acrescenta o rodapé de descadastro (uma vez só).
 * Campanha só de imagem (mensagem vazia) vira legenda só com o rodapé.
 * `saudacaoFixa` é pra prévia da tela não ficar trocando "Oi"/"Olá" a cada tecla.
 */
export function montarTexto(
  mensagem: string,
  nomeCliente: string | null | undefined,
  opcoes: { saudacaoFixa?: string } = {}
): string {
  const primeiro = primeiroNome(nomeCliente);
  // Sorteado UMA vez por mensagem (igual a antes): duas {{saudacao}} saem iguais.
  const saudacao = opcoes.saudacaoFixa ?? sortear(CFG.saudacoes);
  const semNome = opcoes.saudacaoFixa ? `${opcoes.saudacaoFixa}!` : sortear(CFG.saudacoesSemNome);
  let texto = mensagem.replace(/\{\{\s*saudacao\s*\}\}/gi, () => saudacao);

  if (primeiro) {
    texto = texto.replace(/\{\{\s*nome\s*\}\}/gi, primeiro);
  } else {
    // Sem nome no cadastro, "Oi, !" fica ridículo — troca a frase inteira.
    texto = texto.replace(/(oi|olá|ola)[,\s]*\{\{\s*nome\s*\}\}\s*!?/gi, () => semNome);
    texto = texto.replace(/\{\{\s*nome\s*\}\}/gi, "");
  }

  texto = texto.replace(/[ \t]{2,}/g, " ").trim();
  if (CFG.rodapeOptout && !/responda\s+sair/i.test(texto)) texto = texto ? texto + CFG.rodapeOptout : CFG.rodapeOptout.trim();
  return texto;
}

/** Uma mensagem no formato da uazapi — o MESMO para o lote (/sender/advanced) e para o teste (/send/media, /send/text). */
export type ItemUazapi =
  | { number: string; type: "text"; text: string }
  | { number: string; type: "image"; file: string; text: string };

/**
 * Monta a mensagem de um destinatário. Com imagem, sai UMA mensagem de foto com
 * a legenda dentro (type "image" + file + text, docs.uazapi.com v2.6.9) — nunca
 * foto e texto separados, nem a foto como documento.
 */
export function itemDaUazapi(numero: string, texto: string, linkImagem: string | null): ItemUazapi {
  if (linkImagem) return { number: numero, type: "image", file: linkImagem, text: texto };
  return { number: numero, type: "text", text: texto };
}
