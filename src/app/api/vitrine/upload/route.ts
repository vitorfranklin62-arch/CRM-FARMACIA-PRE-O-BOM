import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_IMAGEM = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO = 25 * 1024 * 1024; // 25MB

const TIPOS_IMAGEM: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const TIPOS_VIDEO: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * POST /api/vitrine/upload
 * Sobe foto ou vídeo de um item da vitrine (site público) pro bucket
 * `branding` do Supabase Storage e devolve a URL pública. Só a dona pode
 * chamar. Aceita imagem OU vídeo no mesmo campo `file` — o tipo do arquivo
 * decide em qual pasta e com qual limite de tamanho ele entra.
 */
export async function POST(request: Request) {
  await requireDona();

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  const file = fileEntry as File;

  const ehImagem = TIPOS_IMAGEM[file.type];
  const ehVideo = TIPOS_VIDEO[file.type];

  if (!ehImagem && !ehVideo) {
    return NextResponse.json({ error: "Envie uma imagem (JPEG/PNG/WEBP) ou um vídeo (MP4/WEBM)." }, { status: 400 });
  }

  const limite = ehImagem ? MAX_IMAGEM : MAX_VIDEO;
  if (file.size > limite) {
    return NextResponse.json(
      { error: `Arquivo muito grande (máximo ${Math.round(limite / 1024 / 1024)}MB).` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const extensao = ehImagem ?? ehVideo;
  const pasta = ehImagem ? "vitrine/imagens" : "vitrine/videos";
  const caminho = `${pasta}/${Date.now()}-${crypto.randomUUID()}.${extensao}`;

  const { error: uploadError } = await supabase.storage
    .from("branding")
    .upload(caminho, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: "Não foi possível salvar o arquivo.", detalhe: uploadError.message },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage.from("branding").getPublicUrl(caminho);

  return NextResponse.json({ url: publicUrlData.publicUrl, tipo: ehImagem ? "imagem" : "video" });
}
