import { createServiceClient } from "@/lib/supabase/server";
import type { TipoMensagem } from "@/types/database";
import type { MensagemComUsuario } from "@/types/relations";

const BUCKET = "chat-midia";

// Cada tipo tem um limite diferente porque foto/PDF de receita costuma ser
// bem menor que um áudio de vários minutos.
const LIMITES_BYTES: Record<Exclude<TipoMensagem, "texto">, number> = {
  imagem: 10 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  documento: 15 * 1024 * 1024,
};

const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

/**
 * Baixa o arquivo do link temporário que a uazapi devolve (o mesmo link que o
 * N8N já usa pra transcrever áudio / analisar imagem) e guarda uma cópia
 * permanente no Storage do CRM — o link da uazapi não é garantido durar.
 * Se der qualquer problema, devolve null em vez de derrubar o cadastro da
 * mensagem: a conversa continua registrada só com o texto, sem travar nada.
 */
export async function baixarEArmazenarMidia(params: {
  conversaId: string;
  tipo: Exclude<TipoMensagem, "texto">;
  urlTemporaria: string;
  mimeInformado: string | null;
}): Promise<{ midia_path: string; midia_mime: string } | null> {
  try {
    const resposta = await fetch(params.urlTemporaria);
    if (!resposta.ok) return null;

    // O WhatsApp manda "audio/ogg; codecs=opus": corta o que vem depois do ";"
    // e usa minúsculas, senão a extensão não é encontrada e vira ".bin".
    const mimeBruto = params.mimeInformado || resposta.headers.get("content-type") || "application/octet-stream";
    const mime = mimeBruto.split(";")[0].trim().toLowerCase() || "application/octet-stream";
    const bytes = await resposta.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > LIMITES_BYTES[params.tipo]) return null;

    const extensao = EXTENSAO_POR_MIME[mime] ?? (params.tipo === "documento" ? "pdf" : "bin");
    const caminho = `${params.conversaId}/${Date.now()}-${crypto.randomUUID()}.${extensao}`;

    const supabase = createServiceClient();
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, upsert: false });
    if (error) return null;

    return { midia_path: caminho, midia_mime: mime };
  } catch {
    return null;
  }
}

// Formatos aceitos para áudio gravado pelo painel. O painel converte pra
// OGG/Opus (o formato das mensagens de voz do WhatsApp — ver
// src/lib/audio-ogg-opus.ts); webm e mp4 só chegam se o navegador não conseguir
// converter, e a uazapi/WhatsApp pode ou não aceitar.
const MIMES_AUDIO_GRAVADO = ["audio/ogg", "audio/webm", "audio/mp4"];

// O WhatsApp limita áudio a 16 MB.
const LIMITE_AUDIO_EQUIPE_BYTES = 16 * 1024 * 1024;

// Confere se os primeiros bytes batem com o tipo declarado — o `type` do upload
// vem do navegador e não prova nada sobre o conteúdo.
function conteudoCombinaComMime(mime: string, bytes: ArrayBuffer) {
  const inicio = new Uint8Array(bytes.slice(0, 64));
  const texto = (de: number, ate: number) => String.fromCharCode(...Array.from(inicio.slice(de, ate)));
  if (mime === "audio/ogg") return texto(0, 4) === "OggS" && texto(0, 64).includes("OpusHead");
  if (mime === "audio/webm") return inicio[0] === 0x1a && inicio[1] === 0x45 && inicio[2] === 0xdf && inicio[3] === 0xa3;
  if (mime === "audio/mp4") return texto(4, 8) === "ftyp";
  return false;
}

type ResultadoAudioEquipe =
  | { ok: true; midia_path: string; midia_mime: string }
  | { ok: false; motivo: "invalido" | "grande_demais" | "duplicado" | "falha" };

/**
 * Guarda no Storage um áudio gravado pela equipe no painel. O caminho usa o
 * `envioId` que a tela gera por gravação: se o mesmo envio chegar duas vezes
 * (duplo clique, retry), o segundo é recusado como "duplicado".
 */
export async function guardarAudioDaEquipe(params: {
  conversaId: string;
  envioId: string;
  bytes: ArrayBuffer;
  mimeInformado: string;
}): Promise<ResultadoAudioEquipe> {
  const mime = params.mimeInformado.split(";")[0].trim().toLowerCase();
  if (!MIMES_AUDIO_GRAVADO.includes(mime) || params.bytes.byteLength === 0) return { ok: false, motivo: "invalido" };
  if (params.bytes.byteLength > LIMITE_AUDIO_EQUIPE_BYTES) return { ok: false, motivo: "grande_demais" };
  if (!conteudoCombinaComMime(mime, params.bytes)) return { ok: false, motivo: "invalido" };

  const caminho = `${params.conversaId}/envio-${params.envioId}.${EXTENSAO_POR_MIME[mime]}`;
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, params.bytes, { contentType: mime, upsert: false });
  if (error) {
    const jaExiste = (error as { statusCode?: string }).statusCode === "409" || /already exists/i.test(error.message);
    return { ok: false, motivo: jaExiste ? "duplicado" : "falha" };
  }

  return { ok: true, midia_path: caminho, midia_mime: mime };
}

/** Desfaz um upload feito por esta mesma requisição (quando o envio falha e a tela vai tentar de novo). */
export async function removerMidia(caminho: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.storage.from(BUCKET).remove([caminho]);
}

/** Link assinado de um arquivo só — usado pra uazapi/N8N buscarem o áudio a enviar. */
export async function gerarUrlAssinada(caminho: string, segundos: number): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, segundos);
  return error || !data ? null : data.signedUrl;
}

const EXPIRACAO_SEGUNDOS = 60 * 60 * 6; // 6h — dá pra ver a conversa toda sem precisar gerar de novo a cada clique

/**
 * Troca midia_path (caminho interno) por midia_url (link assinado, temporário)
 * em lote. O bucket é privado, então sem isso a imagem/áudio/PDF não carrega
 * no navegador de ninguém.
 */
export async function anexarUrlsAssinadas(mensagens: MensagemComUsuario[]): Promise<MensagemComUsuario[]> {
  const caminhos = mensagens.filter((m) => m.midia_path).map((m) => m.midia_path as string);
  if (caminhos.length === 0) return mensagens;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, EXPIRACAO_SEGUNDOS);
  if (error || !data) return mensagens;

  const urlPorCaminho = new Map(data.map((item) => [item.path, item.signedUrl]));
  return mensagens.map((m) => (m.midia_path ? { ...m, midia_url: urlPorCaminho.get(m.midia_path) ?? null } : m));
}
