import type { TipoMensagem } from "@/types/database";

/**
 * Regras de mídia do Chat que valem tanto no navegador (validar antes de
 * subir) quanto no servidor (validar de novo, porque o navegador não é
 * confiável). Sem nada de servidor aqui dentro, pra poder ser importado
 * pelos componentes.
 */

export type TipoMidia = Exclude<TipoMensagem, "texto">;

// Cada tipo tem um limite diferente porque foto/PDF de receita costuma ser
// bem menor que um áudio de vários minutos.
export const LIMITES_BYTES: Record<TipoMidia, number> = {
  imagem: 10 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  documento: 15 * 1024 * 1024,
};

const EXTENSAO_POR_MIME: Record<TipoMidia, Record<string, string>> = {
  imagem: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  audio: {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/webm": "webm",
  },
  documento: { "application/pdf": "pdf" },
};

/** Valor pro atributo `accept` do input de arquivo. */
export const ACCEPT_ANEXO = [
  ...Object.keys(EXTENSAO_POR_MIME.imagem),
  ...Object.keys(EXTENSAO_POR_MIME.documento),
  ...Object.keys(EXTENSAO_POR_MIME.audio),
].join(",");

/** "audio/ogg; codecs=opus" -> "audio/ogg". */
export function mimeBase(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function tipoPorMime(mime: string): TipoMidia | null {
  const base = mimeBase(mime);
  for (const tipo of Object.keys(EXTENSAO_POR_MIME) as TipoMidia[]) {
    if (base in EXTENSAO_POR_MIME[tipo]) return tipo;
  }
  return null;
}

export function extensaoPorMime(mime: string): string | null {
  const base = mimeBase(mime);
  for (const tipo of Object.keys(EXTENSAO_POR_MIME) as TipoMidia[]) {
    if (base in EXTENSAO_POR_MIME[tipo]) return EXTENSAO_POR_MIME[tipo][base];
  }
  return null;
}

/** Texto gravado em `conteudo` quando o anexo vai sem legenda (a coluna não aceita vazio). */
export function textoPadraoMidia(tipo: TipoMidia, nome?: string | null): string {
  if (tipo === "imagem") return "📷 Foto";
  if (tipo === "audio") return "🎤 Áudio";
  return `📎 ${nome || "Documento"}`;
}

export function mensagemLimite(tipo: TipoMidia): string {
  return `Arquivo muito grande (máximo ${Math.round(LIMITES_BYTES[tipo] / 1024 / 1024)}MB para ${
    tipo === "imagem" ? "foto" : tipo === "audio" ? "áudio" : "PDF"
  }).`;
}

export const MENSAGEM_FORMATO_INVALIDO = "Formato não suportado. Envie foto (JPG, PNG, WEBP), PDF ou áudio.";
