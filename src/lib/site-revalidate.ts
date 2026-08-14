import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Avisa o site público (farmaciaprecobom.com.br) que a vitrine mudou, pra ele
 * atualizar a página na hora em vez de esperar o revalidate automático por
 * tempo. Best-effort — se a URL não estiver configurada ou o site estiver
 * fora do ar, isso nunca deve derrubar a ação que a dona está fazendo no CRM.
 */
export async function revalidarSite(supabase: SupabaseClient<Database>): Promise<void> {
  try {
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "site_revalidate_url")
      .maybeSingle();

    const url = data?.valor;
    const secret = process.env.SITE_REVALIDATE_SECRET;
    if (!url || !secret) return;

    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // best-effort — nunca bloquear a ação principal por causa disso
  }
}
