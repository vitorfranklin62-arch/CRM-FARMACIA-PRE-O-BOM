import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { chamarUazapi, configUazapi, ERRO_SEM_CONFIG, interpretarEstado, respostaSegura } from "@/lib/uazapi";

/**
 * GET /api/configuracoes/uazapi/status
 * Status da instância do WhatsApp (conectada, conectando com QR/código,
 * desconectada) já interpretado pra tela, junto com a resposta bruta da
 * uazapi pra diagnóstico. Só a dona pode chamar — o token da instância nunca
 * sai do servidor.
 */
export async function GET() {
  await requireDona();

  const config = configUazapi();
  if (!config) return NextResponse.json({ error: ERRO_SEM_CONFIG, configurado: false }, { status: 400 });

  const resposta = await chamarUazapi(config, "/instance/status");
  if (!resposta.ok) {
    return NextResponse.json({ error: resposta.erro, detalhe: respostaSegura(resposta.detalhe) }, { status: 502 });
  }

  return NextResponse.json({ estado: interpretarEstado(resposta.dados), dados: respostaSegura(resposta.dados) });
}
