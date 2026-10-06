import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CampanhasList, type ResumoEnvio } from "@/components/campanhas/CampanhasList";
import type { Campanha } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CampanhasPage() {
  const usuario = await requireDona();
  const supabase = await createClient();

  const { data } = await supabase.from("campanhas").select("*").order("criado_em", { ascending: false });

  // Relatório de envio por campanha, a partir do log que o N8N grava.
  const { data: envios } = await supabase.from("campanha_envios").select("campanha_id, status").limit(50000);
  const resumo: Record<string, ResumoEnvio> = {};
  for (const e of envios ?? []) {
    const r = (resumo[e.campanha_id] ??= { enviado: 0, falhou: 0, sem_whatsapp: 0, invalido: 0 });
    r[e.status as keyof ResumoEnvio]++;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titulo-gradiente text-xl font-bold">Campanhas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Crie e agende campanhas de mensagens para seus clientes.</p>
      </div>

      <CampanhasList campanhas={(data as Campanha[]) ?? []} userId={usuario.id} resumo={resumo} />
    </div>
  );
}
