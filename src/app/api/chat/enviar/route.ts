import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mensagemCreateSchema } from "@/lib/validation";
import { lerCorpo } from "@/lib/api";
import { notificarMensagemChat } from "@/lib/n8n";

/**
 * POST /api/chat/enviar
 * Chamado pelo painel quando uma funcionária/dona responde no Chat ao vivo.
 * Salva a mensagem no Supabase e notifica o N8N para entregar via UAIZAP/WhatsApp.
 */
export async function POST(request: Request) {
  const usuario = await requireUser();

  const corpo = await lerCorpo(request, mensagemCreateSchema);
  if (corpo.resposta) return corpo.resposta;

  const { conversa_id, conteudo } = corpo.dados;
  const supabase = await createClient();

  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id, clientes(nome, telefone)")
    .eq("id", conversa_id)
    .single();

  if (conversaError || !conversa) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({ conversa_id, remetente: "funcionaria", usuario_id: usuario.id, conteudo })
    .select("id")
    .single();

  if (mensagemError || !mensagem) {
    return NextResponse.json({ error: "Não foi possível registrar a mensagem." }, { status: 500 });
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
  await notificarMensagemChat({
    conversaId: conversa_id,
    mensagemId: mensagem.id,
    conteudo,
    cliente: { nome: cliente?.nome ?? null, telefone: cliente?.telefone ?? null },
  });

  return NextResponse.json({ id: mensagem.id }, { status: 201 });
}
