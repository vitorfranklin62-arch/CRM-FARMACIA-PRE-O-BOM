import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { gerarUrlAssinada, guardarAudioDaEquipe, removerMidia } from "@/lib/chat-midia";

const CONTEUDO_AUDIO = "[Áudio enviado pela equipe]";

/**
 * POST /api/chat/enviar-audio  (multipart/form-data: conversa_id, envio_id, audio)
 * Chamado pelo painel quando uma funcionária grava um áudio no Chat ao vivo.
 * Guarda o arquivo no bucket privado, registra a mensagem e pede ao N8N que
 * entregue como mensagem de voz no WhatsApp (via uazapi). É uma rota à parte
 * da /api/chat/enviar pra não mexer no envio de texto.
 *
 * Respostas:
 *  201 { enviado: true }                  N8N aceitou e repassou à uazapi.
 *  201 { enviado: false, incerto: true }  N8N não respondeu a tempo: o áudio pode ter saído; NÃO reenviar sem conferir.
 *  502 { error }                          N8N/uazapi recusou: nada ficou salvo, pode tentar de novo.
 *  409 { error }                          esse envio_id já foi processado (duplo clique/retry).
 * "enviado" quer dizer "aceito pelo N8N/uazapi" — a confirmação de entrega no
 * celular do cliente não chega até aqui.
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
  const envioIdParsed = z.string().uuid().safeParse(form.get("envio_id"));
  const arquivo = form.get("audio");
  if (!conversaIdParsed.success || !envioIdParsed.success || !(arquivo instanceof File)) {
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
    envioId: envioIdParsed.data,
    bytes: await arquivo.arrayBuffer(),
    mimeInformado: arquivo.type,
  });
  if (!midia.ok) {
    const respostas = {
      invalido: { status: 422, error: "Arquivo de áudio vazio ou em formato inválido." },
      grande_demais: { status: 413, error: "O áudio passa de 16 MB (limite do WhatsApp). Grave um áudio mais curto." },
      duplicado: { status: 409, error: "Este áudio já foi enviado." },
      falha: { status: 500, error: "Não foi possível guardar o áudio. Tente de novo." },
    } as const;
    const { status, error } = respostas[midia.motivo];
    return NextResponse.json({ error }, { status });
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
    await removerMidia(midia.midia_path);
    return NextResponse.json({ error: "Não foi possível registrar a mensagem." }, { status: 500 });
  }

  const service = createServiceClient();
  const desfazer = async () => {
    // Só desfaz o que ESTA requisição criou, pra a tela poder tentar de novo sem duplicar nada.
    await service.from("mensagens").delete().eq("id", mensagem.id);
    await removerMidia(midia.midia_path);
  };

  const { data: config } = await service
    .from("configuracoes")
    .select("valor")
    .eq("chave", "integracao_n8n_chat_webhook_url")
    .maybeSingle();

  const webhookUrl = config?.valor;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  // Link curto: só precisa durar o tempo da uazapi baixar o arquivo.
  const midiaUrl = await gerarUrlAssinada(midia.midia_path, 60 * 60);

  if (!webhookUrl || !secret || !midiaUrl) {
    await desfazer();
    return NextResponse.json(
      { error: "Envio de WhatsApp não configurado (webhook do N8N ou segredo ausente). Fale com o administrador." },
      { status: 502 }
    );
  }

  const cliente = Array.isArray(conversa.clientes) ? conversa.clientes[0] : conversa.clientes;
  let resposta: Response;
  try {
    resposta = await fetch(webhookUrl, {
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
  } catch {
    // Sem resposta (timeout/rede): o N8N pode ter entregue. Mantém tudo salvo
    // e avisa a tela pra não reenviar às cegas.
    await supabase
      .from("conversas")
      .update({ atualizado_em: new Date().toISOString(), status: "aguardando_humano" })
      .eq("id", conversa_id);
    return NextResponse.json({ id: mensagem.id, enviado: false, incerto: true }, { status: 201 });
  }

  if (!resposta.ok) {
    await desfazer();
    return NextResponse.json(
      { error: "O WhatsApp recusou o áudio (N8N/uazapi respondeu com erro). Tente de novo." },
      { status: 502 }
    );
  }

  // Mesmo efeito do envio de texto: humano assumiu, a IA não responde por cima.
  await supabase
    .from("conversas")
    .update({ atualizado_em: new Date().toISOString(), status: "aguardando_humano" })
    .eq("id", conversa_id);

  return NextResponse.json({ id: mensagem.id, enviado: true }, { status: 201 });
}
