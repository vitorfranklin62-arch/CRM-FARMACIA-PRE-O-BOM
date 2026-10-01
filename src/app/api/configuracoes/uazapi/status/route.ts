import { requireDona } from "@/lib/auth";
import { chamarUazapi } from "@/lib/uazapi";

/**
 * GET /api/configuracoes/uazapi/status
 * Consulta o status da instância de WhatsApp (conectada/desconectada) na
 * UAIZAP. Só a dona pode chamar.
 */
export async function GET() {
  await requireDona();
  return chamarUazapi({
    caminho: "/instance/status",
    metodo: "GET",
    mensagemRecusa: "A UAIZAP recusou a consulta de status.",
  });
}
