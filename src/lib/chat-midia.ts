import { createServiceClient } from "@/lib/supabase/server";
import { LIMITES_BYTES, extensaoPorMime, mimeBase, type TipoMidia } from "@/lib/chat-midia-tipos";
import type { MensagemComUsuario } from "@/types/relations";

const BUCKET = "chat-midia";

/**
 * Baixa o arquivo do link temporário que a uazapi devolve (o mesmo link que o
 * N8N já usa pra transcrever áudio / analisar imagem) e guarda uma cópia
 * permanente no Storage do CRM — o link da uazapi não é garantido durar.
 * Se der qualquer problema, devolve null em vez de derrubar o cadastro da
 * mensagem: a conversa continua registrada só com o texto, sem travar nada.
 */
export async function baixarEArmazenarMidia(params: {
  conversaId: string;
  tipo: TipoMidia;
  urlTemporaria: string;
  mimeInformado: string | null;
}): Promise<{ midia_path: string; midia_mime: string } | null> {
  try {
    const resposta = await fetch(params.urlTemporaria);
    if (!resposta.ok) return null;

    const mime = params.mimeInformado || resposta.headers.get("content-type") || "application/octet-stream";
    const bytes = await resposta.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > LIMITES_BYTES[params.tipo]) return null;

    const extensao = extensaoPorMime(mime) ?? (params.tipo === "documento" ? "pdf" : "bin");
    const caminho = `${params.conversaId}/${Date.now()}-${crypto.randomUUID()}.${extensao}`;

    const supabase = createServiceClient();
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, upsert: false });
    if (error) return null;

    return { midia_path: caminho, midia_mime: mime };
  } catch {
    return null;
  }
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

/**
 * Guarda no bucket privado o arquivo que a equipe anexou no painel (o inverso
 * de `baixarEArmazenarMidia`, que guarda o que o cliente mandou). Devolve o
 * caminho interno ou o motivo da falha — aqui a equipe precisa saber por que
 * o anexo não foi, diferente do webhook, que pode seguir só com o texto.
 */
export async function armazenarMidiaEnviada(params: {
  conversaId: string;
  bytes: ArrayBuffer;
  mime: string;
}): Promise<{ path: string } | { erro: string }> {
  const mime = mimeBase(params.mime);
  const extensao = extensaoPorMime(mime) ?? "bin";
  const caminho = `${params.conversaId}/saida-${Date.now()}-${crypto.randomUUID()}.${extensao}`;

  const { error } = await createServiceClient()
    .storage.from(BUCKET)
    .upload(caminho, params.bytes, { contentType: mime, upsert: false });

  if (error) return { erro: error.message };
  return { path: caminho };
}

/** Link assinado de um arquivo do bucket — é ele que o N8N passa pra uazapi baixar e entregar no WhatsApp. */
export async function urlAssinadaDaMidia(caminho: string, segundos = 60 * 60): Promise<string | null> {
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUrl(caminho, segundos);
  if (error || !data) return null;
  return data.signedUrl;
}
