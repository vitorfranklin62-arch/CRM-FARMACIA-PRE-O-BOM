import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const TIPOS_ACEITOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * POST /api/configuracoes/vitoria-foto
 * Sobe a foto customizada da Vitória AI (Configurações → Vitória AI) pro
 * bucket `branding` do Supabase Storage e salva a URL pública em
 * `configuracoes.vitoria_ia_foto_url`. Só a dona pode chamar.
 */
export async function POST(request: Request) {
  const dona = await requireDona();

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json({ error: "Nenhuma imagem enviada." }, { status: 400 });
  }
  const file = fileEntry as File;

  const extensao = TIPOS_ACEITOS[file.type];
  if (!extensao) {
    return NextResponse.json({ error: "Envie uma imagem JPEG, PNG ou WEBP." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Imagem muito grande (máximo 5MB)." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const caminho = `vitoria-ia/foto-${Date.now()}.${extensao}`;

  const { error: uploadError } = await supabase.storage
    .from("branding")
    .upload(caminho, await file.arrayBuffer(), { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: "Não foi possível salvar a imagem.", detalhe: uploadError.message },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage.from("branding").getPublicUrl(caminho);

  const { error: configError } = await supabase
    .from("configuracoes")
    .upsert({ chave: "vitoria_ia_foto_url", valor: publicUrlData.publicUrl, tipo: "string" }, { onConflict: "chave" });

  if (configError) {
    return NextResponse.json(
      { error: "Imagem salva, mas não foi possível atualizar a configuração.", detalhe: configError.message },
      { status: 500 }
    );
  }

  await logAudit(supabase, "configuracoes_atualizadas", "configuracoes", null, { chave: "vitoria_ia_foto_url" }, dona.id);

  return NextResponse.json({ url: publicUrlData.publicUrl });
}

/**
 * DELETE /api/configuracoes/vitoria-foto
 * Remove a foto customizada — volta a mostrar o desenho padrão da Vitória.
 * Só apaga a referência em `configuracoes`; o arquivo fica no Storage (custo
 * desprezível, evita complexidade extra de sincronizar remoção de arquivo).
 */
export async function DELETE() {
  const dona = await requireDona();
  const supabase = createServiceClient();

  await supabase.from("configuracoes").delete().eq("chave", "vitoria_ia_foto_url");
  await logAudit(
    supabase,
    "configuracoes_atualizadas",
    "configuracoes",
    null,
    { chave: "vitoria_ia_foto_url", removida: true },
    dona.id
  );

  return NextResponse.json({ ok: true });
}
