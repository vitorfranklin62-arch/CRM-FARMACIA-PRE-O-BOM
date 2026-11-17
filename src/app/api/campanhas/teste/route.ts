import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { campanhaTesteSchema } from "@/lib/validation";
import { chamarUazapi, configUazapi, ERRO_SEM_CONFIG, respostaSegura } from "@/lib/uazapi";
import { itemDaUazapi, montarTexto, telefoneDaCampanha } from "@/lib/campanhas/regras";
import { linkDaImagemParaEnvio } from "@/lib/campanhas/midia";

/**
 * POST /api/campanhas/teste  { envio_id, numero, nome?, mensagem, midia_path }
 * Botão "Enviar teste" da Nova campanha. Manda UMA mensagem — a mesma que o
 * disparo montaria (mesmo texto personalizado, mesmo rodapé, mesma imagem,
 * mesmo formato de item) — para o número que a dona digitou, e devolve a
 * resposta real da uazapi.
 *
 * Nunca toca na campanha nem em campanha_envios: não conta na cota do dia,
 * não marca ninguém como "já recebeu" e não dispara nada para a base.
 * Endpoints: /send/media (com imagem) ou /send/text (só texto).
 */

// Mesmo envio chegando duas vezes (duplo clique, rede que repete): o segundo é recusado.
const enviosRecentes = new Map<string, number>();
function jaProcessado(envioId: string): boolean {
  const agora = Date.now();
  enviosRecentes.forEach((quando, id) => {
    if (agora - quando > 10 * 60_000) enviosRecentes.delete(id);
  });
  if (enviosRecentes.has(envioId)) return true;
  enviosRecentes.set(envioId, agora);
  return false;
}

export async function POST(request: Request) {
  const dona = await requireDona();

  if (!rateLimit(`campanha-teste:${dona.id}`, { limit: 6, windowMs: 10 * 60_000 }).success) {
    return NextResponse.json({ error: "Limite de testes atingido (6 a cada 10 minutos). Espere um pouco." }, { status: 429 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const envioId = z.string().uuid().safeParse((corpo as { envio_id?: unknown } | null)?.envio_id);
  const parsed = campanhaTesteSchema.safeParse(corpo);
  if (!envioId.success || !parsed.success) {
    return NextResponse.json({ error: "Escreva a mensagem ou adicione uma imagem antes de testar." }, { status: 400 });
  }

  const numero = telefoneDaCampanha(parsed.data.numero);
  if (!numero) {
    return NextResponse.json({ error: "Número inválido. Use DDD + número (ex.: 71 99999-9999)." }, { status: 400 });
  }

  const config = configUazapi();
  if (!config) return NextResponse.json({ error: ERRO_SEM_CONFIG }, { status: 500 });

  if (jaProcessado(envioId.data)) {
    return NextResponse.json({ error: "Este teste já foi enviado." }, { status: 409 });
  }

  // Link curto: no teste a uazapi baixa a imagem na hora.
  let linkImagem: string | null = null;
  if (parsed.data.midia_path) {
    linkImagem = await linkDaImagemParaEnvio(parsed.data.midia_path, 60 * 60);
    if (!linkImagem) {
      return NextResponse.json({ error: "Não encontrei a imagem no armazenamento. Selecione a imagem de novo." }, { status: 404 });
    }
  }

  const texto = montarTexto(parsed.data.mensagem, parsed.data.nome || "Maria");
  const item = itemDaUazapi(numero, texto, linkImagem);
  const endpoint = item.type === "image" ? "/send/media" : "/send/text";
  const resposta = await chamarUazapi(config, endpoint, {
    method: "POST",
    body: { ...item, track_source: "crm_campanha_teste", track_id: envioId.data },
  });

  const supabase = await createClient();
  await logAudit(
    supabase,
    "campanha_teste_enviado",
    "campanhas",
    null,
    { numero_final: numero.slice(-4), com_imagem: !!linkImagem, ok: resposta.ok, http: resposta.status },
    dona.id
  );

  const dados = resposta.ok ? resposta.dados : resposta.detalhe;
  const obj = dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : null;
  const messageid = typeof obj?.messageid === "string" ? obj.messageid : null;

  return NextResponse.json(
    {
      ok: resposta.ok,
      http: resposta.status,
      erro: resposta.ok ? null : resposta.erro,
      endpoint,
      messageid,
      // O que foi mandado (sem o token, que vai no cabeçalho e nunca aparece aqui).
      enviado: { ...item, file: item.type === "image" ? item.file : undefined },
      resposta: respostaSegura(dados),
    },
    { status: resposta.ok ? 200 : 502 }
  );
}
