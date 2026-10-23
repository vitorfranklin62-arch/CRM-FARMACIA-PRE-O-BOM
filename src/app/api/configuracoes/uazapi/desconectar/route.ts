import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { chamarUazapi, configUazapi, ERRO_SEM_CONFIG, interpretarEstado, respostaSegura } from "@/lib/uazapi";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/configuracoes/uazapi/desconectar
 * Desconecta o número do WhatsApp da instância (a IA e o Chat ao vivo param
 * de enviar/receber até conectar de novo). Só a dona pode chamar.
 */
export async function POST() {
  const usuario = await requireDona();

  const config = configUazapi();
  if (!config) return NextResponse.json({ error: ERRO_SEM_CONFIG, configurado: false }, { status: 400 });

  const resposta = await chamarUazapi(config, "/instance/disconnect", { method: "POST" });
  if (!resposta.ok) {
    return NextResponse.json({ error: resposta.erro, detalhe: respostaSegura(resposta.detalhe) }, { status: 502 });
  }

  const supabase = await createClient();
  await logAudit(supabase, "configuracoes_atualizadas", "configuracoes", null, { acao: "whatsapp_desconectado" }, usuario.id);

  // A resposta do disconnect nem sempre traz o estado completo — confirma no status.
  const status = await chamarUazapi(config, "/instance/status");
  const dados = status.ok ? status.dados : resposta.dados;
  return NextResponse.json({ estado: interpretarEstado(dados), dados: respostaSegura(dados) });
}
