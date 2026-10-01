import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { anexoCreateSchema, mensagemCreateSchema } from "@/lib/validation";
import { lerCorpo } from "@/lib/api";
import { notificarMensagemChat } from "@/lib/n8n";
import { armazenarMidiaEnviada, urlAssinadaDaMidia } from "@/lib/chat-midia";
import {
  LIMITES_BYTES,
  MENSAGEM_FORMATO_INVALIDO,
  mensagemLimite,
  mimeBase,
  textoPadraoMidia,
  tipoPorMime,
  type TipoMidia,
} from "@/lib/chat-midia-tipos";

type Anexo = { tipo: TipoMidia; bytes: ArrayBuffer; mime: string; nome: string };
type EntradaLida =
  | { conversa_id: string; conteudo: string; anexo: Anexo | null; resposta?: never }
  | { resposta: NextResponse };

/** Aceita JSON (só texto) ou multipart (anexo + legenda opcional). */
async function lerEntrada(request: Request): Promise<EntradaLida> {
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const corpo = await lerCorpo(request, mensagemCreateSchema);
    if (corpo.resposta) return { resposta: corpo.resposta };
    return { conversa_id: corpo.dados.conversa_id, conteudo: corpo.dados.conteudo, anexo: null };
  }

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("file");
  const campos = anexoCreateSchema.safeParse({
    conversa_id: form?.get("conversa_id")?.toString(),
    legenda: form?.get("legenda")?.toString() || undefined,
  });
  if (!form || !campos.success || !arquivo || typeof arquivo === "string") {
    return { resposta: NextResponse.json({ error: "Envio inválido." }, { status: 400 }) };
  }

  const tipo = tipoPorMime(arquivo.type);
  if (!tipo) return { resposta: NextResponse.json({ error: MENSAGEM_FORMATO_INVALIDO }, { status: 400 }) };
  if (arquivo.size === 0) return { resposta: NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 }) };
  if (arquivo.size > LIMITES_BYTES[tipo]) {
    return { resposta: NextResponse.json({ error: mensagemLimite(tipo) }, { status: 400 }) };
  }

  return {
    conversa_id: campos.data.conversa_id,
    conteudo: campos.data.legenda ?? "",
    anexo: { tipo, bytes: await arquivo.arrayBuffer(), mime: mimeBase(arquivo.type), nome: arquivo.name },
  };
}

/**
 * POST /api/chat/enviar
 * Chamado pelo painel quando uma funcionária/dona responde no Chat ao vivo —
 * com texto, ou com foto, PDF ou áudio (anexo + legenda opcional). Salva a
 * mensagem no Supabase e notifica o N8N para entregar via UAIZAP/WhatsApp.
 */
export async function POST(request: Request) {
  const usuario = await requireUser();

  const entrada = await lerEntrada(request);
  if (entrada.resposta) return entrada.resposta;

  const { conversa_id, conteudo, anexo } = entrada;
  const supabase = await createClient();

  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id, clientes(nome, telefone)")
    .eq("id", conversa_id)
    .single();

  if (conversaError || !conversa) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  let midiaPath: string | null = null;
  if (anexo) {
    const guardado = await armazenarMidiaEnviada({ conversaId: conversa_id, bytes: anexo.bytes, mime: anexo.mime });
    if ("erro" in guardado) {
      return NextResponse.json(
        { error: "Não foi possível guardar o arquivo.", detalhe: guardado.erro },
        { status: 500 }
      );
    }
    midiaPath = guardado.path;
  }

  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({
      conversa_id,
      remetente: "funcionaria",
      usuario_id: usuario.id,
      conteudo: conteudo || (anexo ? textoPadraoMidia(anexo.tipo, anexo.nome) : ""),
      ...(anexo ? { tipo: anexo.tipo, midia_path: midiaPath, midia_nome: anexo.nome, midia_mime: anexo.mime } : {}),
    })
    .select("id")
    .single();

  if (mensagemError || !mensagem) {
    return NextResponse.json(
      { error: "Não foi possível registrar a mensagem.", detalhe: mensagemError?.message ?? null },
      { status: 500 }
    );
  }

  // Uma funcionária respondendo manualmente pelo CRM é sinal de que um humano
  // já está cuidando da conversa — marca "aguardando_humano" pra IA não
  // continuar respondendo por cima (mesmo efeito de quando alguém intervém
  // direto pelo WhatsApp do celular).
  await supabase
    .from("conversas")
    .update({ atualizado_em: new Date().toISOString(), status: "aguardando_humano" })
    .eq("id", conversa_id);

  // Notifica o N8N pra entregar a mensagem via UAIZAP/WhatsApp (best-effort — a mensagem já foi salva)
  const cliente = Array.isArray(conversa.clientes) ? conversa.clientes[0] : conversa.clientes;
  const urlDaMidia = midiaPath ? await urlAssinadaDaMidia(midiaPath) : null;

  await notificarMensagemChat({
    conversaId: conversa_id,
    mensagemId: mensagem.id,
    conteudo: conteudo || (anexo ? textoPadraoMidia(anexo.tipo, anexo.nome) : ""),
    cliente: { nome: cliente?.nome ?? null, telefone: cliente?.telefone ?? null },
    midia:
      anexo && urlDaMidia
        ? { tipo: anexo.tipo, url: urlDaMidia, nome: anexo.nome, mime: anexo.mime, legenda: conteudo }
        : undefined,
  });

  // O arquivo já ficou salvo no painel, mas sem o link assinado o N8N não tem o que entregar.
  const aviso =
    anexo && !urlDaMidia ? "Arquivo salvo no painel, mas não foi possível enviá-lo ao WhatsApp. Tente de novo." : undefined;

  return NextResponse.json({ id: mensagem.id, ...(aviso ? { aviso } : {}) }, { status: 201 });
}
