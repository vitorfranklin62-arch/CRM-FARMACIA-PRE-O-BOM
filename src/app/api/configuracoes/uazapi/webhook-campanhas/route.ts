import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { chamarUazapi, configUazapi, ERRO_SEM_CONFIG, respostaSegura } from "@/lib/uazapi";

/**
 * Webhook da uazapi → CRM usado pelas campanhas (eventos `sender` e
 * `messages_update`, recebidos em /api/webhooks/uazapi).
 *
 * É criado como um webhook ADICIONAL (modo avançado, `action: "add"`), sem
 * mexer no webhook que já leva as mensagens pro N8N. Não usa o filtro
 * `wasSentByApi`: as mensagens de campanha saem pela API, e é justamente o
 * recibo delas que interessa.
 *
 * GET  → diz se já está ativo.  POST → cria (ou corrige) o webhook.
 */

const EVENTOS = ["sender", "messages_update"];

/** Endereço público do CRM. CRM_URL_PUBLICA tem prioridade; sem ela, usa o host da própria requisição. */
function urlDoWebhook(request: Request): string {
  const base = process.env.CRM_URL_PUBLICA?.trim();
  if (base) return `${base.replace(/\/+$/, "")}/api/webhooks/uazapi`;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}/api/webhooks/uazapi`;
}

type Webhook = { id?: string; url?: string; enabled?: boolean; events?: string[] };

async function buscarExistente(config: NonNullable<ReturnType<typeof configUazapi>>, url: string) {
  const resposta = await chamarUazapi(config, "/webhook");
  if (!resposta.ok) return { resposta, webhook: null as Webhook | null };
  const lista = (Array.isArray(resposta.dados) ? resposta.dados : [resposta.dados]) as Webhook[];
  return { resposta, webhook: lista.find((w) => w && w.url === url) ?? null };
}

function completo(w: Webhook | null): boolean {
  return !!w && w.enabled !== false && EVENTOS.every((e) => w.events?.includes(e));
}

export async function GET(request: Request) {
  await requireDona();
  const config = configUazapi();
  if (!config) return NextResponse.json({ error: ERRO_SEM_CONFIG }, { status: 400 });

  const url = urlDoWebhook(request);
  const { resposta, webhook } = await buscarExistente(config, url);
  if (!resposta.ok) return NextResponse.json({ error: resposta.erro, detalhe: respostaSegura(resposta.detalhe) }, { status: 502 });
  return NextResponse.json({ ativo: completo(webhook), url });
}

export async function POST(request: Request) {
  await requireDona();
  const config = configUazapi();
  if (!config) return NextResponse.json({ error: ERRO_SEM_CONFIG }, { status: 400 });

  const url = urlDoWebhook(request);
  if (!url.startsWith("https://")) {
    return NextResponse.json(
      { error: `O endereço do CRM precisa ser https (detectado: ${url}). Defina CRM_URL_PUBLICA no servidor.` },
      { status: 400 }
    );
  }

  const { resposta, webhook } = await buscarExistente(config, url);
  if (!resposta.ok) return NextResponse.json({ error: resposta.erro, detalhe: respostaSegura(resposta.detalhe) }, { status: 502 });
  if (completo(webhook)) return NextResponse.json({ ativo: true, url });

  const corpo = {
    ...(webhook?.id ? { action: "update", id: webhook.id } : { action: "add" }),
    enabled: true,
    url,
    events: EVENTOS,
    // Grupos não recebem campanha; os recibos deles só fariam barulho aqui.
    excludeMessages: ["isGroupYes"],
  };
  const salvo = await chamarUazapi(config, "/webhook", { method: "POST", body: corpo });
  if (!salvo.ok) return NextResponse.json({ error: salvo.erro, detalhe: respostaSegura(salvo.detalhe) }, { status: 502 });

  return NextResponse.json({ ativo: true, url });
}
