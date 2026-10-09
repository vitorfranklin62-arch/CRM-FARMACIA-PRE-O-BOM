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

// Formatos que o navegador grava (MediaRecorder): Chrome/Edge geram webm, Firefox
// gera ogg e o Safari gera mp4. Qualquer outro tipo é recusado.
const MIMES_AUDIO_GRAVADO = ["audio/webm", "audio/ogg", "audio/mp4"];

/**
 * Guarda no Storage um áudio gravado pela equipe no painel. Devolve null se o
 * tipo não for de áudio, estiver vazio ou passar do limite — quem chama decide
 * o que responder.
 */
export async function guardarAudioDaEquipe(params: {
  conversaId: string;
  bytes: ArrayBuffer;
  mimeInformado: string;
}): Promise<{ midia_path: string; midia_mime: string } | null> {
  const mime = params.mimeInformado.split(";")[0].trim().toLowerCase();
  if (!MIMES_AUDIO_GRAVADO.includes(mime)) return null;
  if (params.bytes.byteLength === 0 || params.bytes.byteLength > LIMITES_BYTES.audio) return null;

  const caminho = `${params.conversaId}/${Date.now()}-${crypto.randomUUID()}.${EXTENSAO_POR_MIME[mime]}`;
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, params.bytes, { contentType: mime, upsert: false });
  if (error) return null;

  return { midia_path: caminho, midia_mime: mime };
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
