import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDona } from "@/lib/auth";
import { chamarUazapi, configUazapi, ERRO_SEM_CONFIG, interpretarEstado, respostaSegura } from "@/lib/uazapi";
import { telefoneParaWhatsapp } from "@/lib/telefone";

const corpoSchema = z.object({ telefone: z.string().trim().max(30).optional() }).optional();

/**
 * POST /api/configuracoes/uazapi/conectar   { telefone? }
 * Começa a conexão do número da farmácia na uazapi:
 *  - sem telefone → QR code pra ler com a câmera do celular;
 *  - com telefone → código de pareamento pra digitar no celular (sem câmera).
 * Se já houver uma conexão em andamento (409 da uazapi), devolve o status
 * atual em vez de erro — o QR/código que já existe continua valendo.
 * Só a dona pode chamar.
 */
export async function POST(request: Request) {
  await requireDona();

  const config = configUazapi();
  if (!config) return NextResponse.json({ error: ERRO_SEM_CONFIG, configurado: false }, { status: 400 });

  const corpo = corpoSchema.safeParse(await request.json().catch(() => undefined));
  if (!corpo.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  let phone: string | undefined;
  if (corpo.data?.telefone) {
    const telefone = telefoneParaWhatsapp(corpo.data.telefone);
    if (!telefone) {
      return NextResponse.json(
        { error: "Número inválido. Use o número do WhatsApp da farmácia com DDD, ex.: (71) 99937-3863." },
        { status: 400 }
      );
    }
    phone = telefone;
  }

  const resposta = await chamarUazapi(config, "/instance/connect", { method: "POST", body: phone ? { phone } : {} });

  if (!resposta.ok && resposta.status === 409) {
    const status = await chamarUazapi(config, "/instance/status");
    if (status.ok) {
      return NextResponse.json({ estado: interpretarEstado(status.dados), dados: respostaSegura(status.dados), emAndamento: true });
    }
  }

  if (!resposta.ok) {
    return NextResponse.json({ error: resposta.erro, detalhe: respostaSegura(resposta.detalhe) }, { status: 502 });
  }

  return NextResponse.json({ estado: interpretarEstado(resposta.dados), dados: respostaSegura(resposta.dados) });
}
