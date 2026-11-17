import { createServiceClient } from "@/lib/supabase/server";
import { tipoRealDaImagem } from "@/lib/campanhas/midia-validacao";

export { caminhoDeImagemValido, tipoRealDaImagem } from "@/lib/campanhas/midia-validacao";

/**
 * Imagens das campanhas no Storage do Supabase (bucket PRIVADO
 * "campanha-midia", criado em 20261117_campanhas_imagem.sql).
 *
 * Caminho: {campanha_id}/{imagem_id}.jpg — o id da campanha é gerado na tela
 * antes de salvar, então a imagem já nasce na pasta certa, e o banco recusa
 * campanha apontando pra pasta de outra. O arquivo nunca é sobrescrito
 * (upsert: false + nome aleatório): o que foi agendado é o que sai.
 *
 * Só o servidor mexe no bucket (chave service_role). A uazapi recebe um link
 * assinado gerado na hora de montar cada lote (`linkDaImagemParaEnvio`).
 */

export const BUCKET_CAMPANHA = "campanha-midia";

/** 5 MB. O WhatsApp recomprime a foto de qualquer jeito; arquivo maior só deixa o envio lento. */
export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;

export const EXTENSAO_IMAGEM: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Validade do link entregue à uazapi. A documentação (v2.6.9) não diz se ela
 * baixa a imagem ao criar o lote ou na hora de cada envio, então o link
 * precisa durar mais que qualquer lote: um lote dura minutos, mas pode ficar
 * pausado (fim de semana fora da janela, pausa manual). Lote pausado há mais
 * que isso é recriado com link novo (ver disparo.ts).
 */
export const VALIDADE_LINK_ENVIO_SEG = 30 * 24 * 60 * 60;

export type ResultadoUpload =
  | { ok: true; midia_path: string; midia_mime: "image/jpeg" | "image/png"; midia_tamanho: number }
  | { ok: false; status: number; erro: string };

/** Valida e guarda a imagem de uma campanha (ainda não salva). */
export async function guardarImagemDaCampanha(params: {
  campanhaId: string;
  bytes: ArrayBuffer;
  mimeInformado: string;
}): Promise<ResultadoUpload> {
  const tamanho = params.bytes.byteLength;
  if (tamanho === 0) return { ok: false, status: 422, erro: "O arquivo está vazio." };
  if (tamanho > LIMITE_IMAGEM_BYTES) {
    return { ok: false, status: 413, erro: "A imagem passa de 5 MB. Use uma imagem menor." };
  }

  const real = tipoRealDaImagem(params.bytes);
  const informado = params.mimeInformado.split(";")[0].trim().toLowerCase();
  if (!real || real !== informado) {
    return { ok: false, status: 415, erro: "Arquivo não é uma imagem JPG ou PNG válida." };
  }

  const caminho = `${params.campanhaId}/${crypto.randomUUID()}.${EXTENSAO_IMAGEM[real]}`;
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(BUCKET_CAMPANHA)
    .upload(caminho, params.bytes, { contentType: real, upsert: false, cacheControl: "31536000" });
  if (error) {
    const semBucket = /bucket not found/i.test(error.message);
    return {
      ok: false,
      status: 500,
      erro: semBucket
        ? "O armazenamento de imagens de campanha não existe ainda. Rode a migração supabase/migrations/20261117_campanhas_imagem.sql no Supabase."
        : "Não foi possível guardar a imagem. Tente de novo.",
    };
  }
  return { ok: true, midia_path: caminho, midia_mime: real, midia_tamanho: tamanho };
}

/** Apaga uma imagem que nenhuma campanha salva usa (foi trocada ou removida antes de salvar). */
export async function removerImagemNaoUsada(caminho: string): Promise<"removida" | "em_uso" | "falha"> {
  const supabase = createServiceClient();
  const { data: emUso, error } = await supabase.from("campanhas").select("id").eq("midia_path", caminho).limit(1);
  if (error) return "falha";
  if (emUso && emUso.length > 0) return "em_uso";
  const { error: erroRemocao } = await supabase.storage.from(BUCKET_CAMPANHA).remove([caminho]);
  return erroRemocao ? "falha" : "removida";
}

/** Link assinado pra a uazapi baixar a imagem. null = arquivo sumiu do Storage (ou Storage fora do ar). */
export async function linkDaImagemParaEnvio(caminho: string, segundos = VALIDADE_LINK_ENVIO_SEG): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET_CAMPANHA).createSignedUrl(caminho, segundos);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/** Links curtos (1h) pra mostrar as imagens na tela de Campanhas. */
export async function linksParaTela(caminhos: string[]): Promise<Record<string, string>> {
  if (caminhos.length === 0) return {};
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET_CAMPANHA).createSignedUrls(caminhos, 60 * 60);
  if (error || !data) return {};
  const mapa: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl) mapa[item.path] = item.signedUrl;
  return mapa;
}
