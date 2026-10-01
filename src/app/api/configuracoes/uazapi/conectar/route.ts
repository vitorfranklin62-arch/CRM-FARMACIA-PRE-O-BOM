import { requireDona } from "@/lib/auth";
import { chamarUazapi } from "@/lib/uazapi";

/**
 * POST /api/configuracoes/uazapi/conectar
 * Pede pra UAIZAP gerar um QR code novo pra conectar o número do WhatsApp
 * da farmácia. Só a dona pode chamar.
 */
export async function POST() {
  await requireDona();
  return chamarUazapi({
    caminho: "/instance/connect",
    metodo: "POST",
    mensagemRecusa: "A UAIZAP recusou o pedido de conexão.",
  });
}
