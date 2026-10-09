import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { gerarUrlAssinada, guardarAudioDaEquipe } from "@/lib/chat-midia";

const CONTEUDO_AUDIO = "[Áudio enviado pela equipe]";

/**
 * POST /api/chat/enviar-audio  (multipart/form-data: conversa_id + audio)
 * Chamado pelo painel quando uma funcionária grava um áudio no Chat ao vivo.
 * Guarda o arquivo no bucket privado, registra a mensagem e pede ao N8N que
 * entregue como mensagem de voz no WhatsApp. É uma rota à parte da
 * /api/chat/enviar pra não mexer no envio de texto.
 */
export async function POST(request: Request) {
  const usuario = await requireUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const conversaIdParsed = z.string().uuid().safeParse(form.get("conversa_id"));
  const arquivo = form.get("audio");
  if (!conversaIdParsed.success || !(arquivo instanceof File)) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  const conversa_id = conversaIdParsed.data;

  const supabase = await createClient();
  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id, clientes(nome, telefone)")
    .eq("id", conversa_id)
    .single();

  if (conversaError || !conversa) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const midia = await guardarAudioDaEquipe({
    conversaId: conversa_id,
    bytes: await arquivo.arrayBuffer(),
    mimeInformado: arquivo.type,
  });
  if (!midia) {
    return NextResponse.json({ error: "Não foi possível guardar o áudio (vazio, grande demais ou formato inválido)." }, { status: 422 });
  }
  const midiaNome = `audio.${midia.midia_path.split(".").pop()}`;

  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({
      conversa_id,
      remetente: "funcionaria",
      usuario_id: usuario.id,
      conteudo: CONTEUDO_AUDIO,
      tipo: "audio",
      midia_path: midia.midia_path,
      midia_nome: midiaNome,
      midia_mime: midia.midia_mime,
    })
    .select("id")
    .single();

  if (mensagemError || !mensagem) {
    return NextResponse.json({ error: "Não foi possível registrar a mensagem." }, { status: 500 });
  }

  // Mesmo efeito do envio de texto: humano assumiu, a IA não responde por cima.
  await supabase
    .from("conversas")
    .update({ atualizado_em: new Date().toISOString(), status: "aguardando_humano" })
    .eq("id", conversa_id);

  const service = createServiceClient();
  const { data: config } = await service
    .from("configuracoes")
    .select("valor")
    .eq("chave", "integracao_n8n_chat_webhook_url")
    .maybeSingle();

  const webhookUrl = config?.valor;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const cliente = Array.isArray(conversa.clientes) ? conversa.clientes[0] : conversa.clientes;
  // Link curto: só precisa durar o tempo da uazapi baixar o arquivo.
  const midiaUrl = await gerarUrlAssinada(midia.midia_path, 60 * 60);

  // Diferente do texto, aqui avisamos a tela se a entrega ao WhatsApp falhou —
  // o áudio já está salvo no painel, mas o cliente pode não ter recebido.
  let entregue = false;
  if (webhookUrl && secret && midiaUrl) {
    try {
      const resposta = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          conversa_id,
          mensagem_id: mensagem.id,
          conteudo: CONTEUDO_AUDIO,
          tipo: "audio",
          midia_url: midiaUrl,
          midia_nome: midiaNome,
          midia_mime: midia.midia_mime,
          cliente: { nome: cliente?.nome ?? null, telefone: cliente?.telefone ?? null },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      entregue = resposta.ok;
    } catch {
      entregue = false;
    }
  }

  return NextResponse.json({ id: mensagem.id, entregue }, { status: 201 });
}
