import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { anexarUrlsAssinadas } from "@/lib/chat-midia";
import type { MensagemComUsuario } from "@/types/relations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tamanho da página ao abrir a conversa / rolar pra cima.
const POR_PAGINA = 40;
// Teto ao buscar o que chegou "depois de" uma data (mensagens perdidas numa
// queda de conexão, ou a janela inteira já carregada ao renovar os links de mídia).
const MAX_DEPOIS = 500;

/**
 * GET /api/chat/mensagens?conversa_id=...[&antes=ISO | &depois=ISO]
 *
 * Paginação por cursor das mensagens do Chat ao vivo:
 * - sem cursor: as últimas 40 mensagens (abrir a conversa);
 * - `antes`: as 40 anteriores a essa data (rolar pra cima);
 * - `depois`: tudo a partir dessa data, inclusive (mensagem nova pelo
 *   Realtime, recuperar o que se perdeu numa queda de conexão, renovar links).
 *
 * Sempre devolve em ordem cronológica, com os links assinados das mídias
 * (o bucket é privado — ver src/lib/chat-midia.ts). Roda com a sessão do
 * usuário, então a RLS de `mensagens` vale aqui também. Não registra o
 * conteúdo das mensagens em log (dado de saúde do cliente).
 */
export async function GET(request: Request) {
  await requireUser();

  const params = new URL(request.url).searchParams;
  const conversaId = params.get("conversa_id") ?? "";
  const antes = params.get("antes");
  const depois = params.get("depois");

  if (!UUID.test(conversaId)) {
    return NextResponse.json({ error: "conversa_id inválido." }, { status: 400 });
  }
  if ((antes && Number.isNaN(Date.parse(antes))) || (depois && Number.isNaN(Date.parse(depois)))) {
    return NextResponse.json({ error: "Cursor inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  let consulta = supabase.from("mensagens").select("*, usuarios(*)").eq("conversa_id", conversaId);

  let mensagens: MensagemComUsuario[];
  let temMaisAntigas = false;

  if (depois) {
    const { data, error } = await consulta
      .gte("criado_em", depois)
      .order("criado_em", { ascending: true })
      .limit(MAX_DEPOIS);
    if (error) return NextResponse.json({ error: "Não foi possível carregar as mensagens." }, { status: 500 });
    mensagens = (data as MensagemComUsuario[]) ?? [];
  } else {
    if (antes) consulta = consulta.lt("criado_em", antes);
    // Busca uma a mais só pra saber se ainda existe página anterior.
    const { data, error } = await consulta.order("criado_em", { ascending: false }).limit(POR_PAGINA + 1);
    if (error) return NextResponse.json({ error: "Não foi possível carregar as mensagens." }, { status: 500 });
    const linhas = (data as MensagemComUsuario[]) ?? [];
    temMaisAntigas = linhas.length > POR_PAGINA;
    mensagens = linhas.slice(0, POR_PAGINA).reverse();
  }

  return NextResponse.json(
    { mensagens: await anexarUrlsAssinadas(mensagens), temMaisAntigas },
    { headers: { "Cache-Control": "no-store" } }
  );
}
