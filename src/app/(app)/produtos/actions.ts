"use server";

import { revalidateTag } from "next/cache";
import { requireDona } from "@/lib/auth";

/**
 * Atualiza a home do site público (precobom.com.br) na hora, sem esperar os
 * 5 minutos de cache padrão — chamado pelo ProdutoForm depois de salvar um
 * produto marcado pra vitrine.
 */
export async function revalidarSitePublico(): Promise<void> {
  await requireDona();
  revalidateTag("produtos-destaque");
}
