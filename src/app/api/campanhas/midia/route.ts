import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDona } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { caminhoDeImagemValido, guardarImagemDaCampanha, removerImagemNaoUsada } from "@/lib/campanhas/midia";

/**
 * POST /api/campanhas/midia  (multipart/form-data: campanha_id, arquivo)
 * Tela "Nova campanha" → "Adicionar imagem". Guarda a imagem no bucket privado
 * `campanha-midia`, na pasta da campanha que ainda vai ser salva (o id é
 * gerado na tela). Confere tamanho (5 MB) e assinatura do arquivo (JPG/PNG de
 * verdade, não só o nome). Responde { midia_path, midia_mime, midia_tamanho }.
 *
 * DELETE /api/campanhas/midia  { midia_path }
 * Imagem trocada ou removida antes de salvar: apaga o arquivo, desde que
 * nenhuma campanha salva use esse caminho.
 *
 * Só a dona (mesma regra da tela de Campanhas).
 */
export async function POST(request: Request) {
  const dona = await requireDona();
  if (!rateLimit(`campanha-midia:${dona.id}`, { limit: 30, windowMs: 60_000 }).success) {
    return NextResponse.json({ error: "Muitos envios de imagem seguidos. Espere um minuto." }, { status: 429 });
  }

  // Corta antes de ler o corpo inteiro: 5 MB de imagem + folga do multipart.
  if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) {
    return NextResponse.json({ error: "A imagem passa de 5 MB. Use uma imagem menor." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const campanhaId = z.string().uuid().safeParse(form.get("campanha_id"));
  const arquivo = form.get("arquivo");
  if (!campanhaId.success || !(arquivo instanceof File)) {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  // A imagem só entra em campanha NOVA. Campanha já salva não troca de
  // imagem por aqui (o conteúdo é congelado quando o disparo começa).
  const supabase = createServiceClient();
  const { data: existente } = await supabase.from("campanhas").select("id").eq("id", campanhaId.data).maybeSingle();
  if (existente) {
    return NextResponse.json({ error: "Essa campanha já foi salva; a imagem não pode ser trocada." }, { status: 409 });
  }

  const resultado = await guardarImagemDaCampanha({
    campanhaId: campanhaId.data,
    bytes: await arquivo.arrayBuffer(),
    mimeInformado: arquivo.type,
  });
  if (!resultado.ok) return NextResponse.json({ error: resultado.erro }, { status: resultado.status });

  return NextResponse.json(
    { midia_path: resultado.midia_path, midia_mime: resultado.midia_mime, midia_tamanho: resultado.midia_tamanho },
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  await requireDona();

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const caminho = (corpo as { midia_path?: unknown } | null)?.midia_path;
  if (!caminhoDeImagemValido(caminho)) {
    return NextResponse.json({ error: "Caminho de imagem inválido." }, { status: 400 });
  }

  const resultado = await removerImagemNaoUsada(caminho);
  if (resultado === "em_uso") {
    return NextResponse.json({ error: "Essa imagem pertence a uma campanha salva e não pode ser apagada." }, { status: 409 });
  }
  if (resultado === "falha") return NextResponse.json({ error: "Não foi possível apagar a imagem." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
