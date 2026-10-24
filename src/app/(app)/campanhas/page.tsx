import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CampanhasList, type ResumoEnvio } from "@/components/campanhas/CampanhasList";
import { AcompanhamentoEntrega } from "@/components/campanhas/AcompanhamentoEntrega";
import type { Campanha, CampanhaLote } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CampanhasPage() {
  const usuario = await requireDona();
  const supabase = await createClient();

  const { data } = await supabase.from("campanhas").select("*").order("criado_em", { ascending: false });

  // Relatório de envio por campanha, a partir do log que o disparo grava
  // (resultado de cada mensagem + recibos de entrega/leitura da uazapi).
  const { data: envios } = await supabase
    .from("campanha_envios")
    .select("campanha_id, status, entregue_em, lido_em")
    .limit(50000);
  const resumo: Record<string, ResumoEnvio> = {};
  for (const e of envios ?? []) {
    const r = (resumo[e.campanha_id] ??= {
      agendado: 0,
      enviado: 0,
      entregue: 0,
      lido: 0,
      falhou: 0,
      sem_whatsapp: 0,
      invalido: 0,
    });
    if (e.status === "cancelado") continue;
    r[e.status]++;
    if (e.entregue_em) r.entregue++;
    if (e.lido_em) r.lido++;
  }

  // Lote em aberto de cada campanha (o que está na fila da uazapi agora).
  const { data: lotes } = await supabase
    .from("campanha_lotes")
    .select("*")
    .in("status", ["criando", "agendado", "enviando", "pausado"]);
  const loteAberto: Record<string, CampanhaLote> = {};
  for (const l of (lotes as CampanhaLote[] | null) ?? []) loteAberto[l.campanha_id] = l;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titulo-gradiente text-xl font-bold">Campanhas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Crie e agende campanhas de mensagens para seus clientes.</p>
      </div>

      <AcompanhamentoEntrega />

      <CampanhasList
        campanhas={(data as Campanha[]) ?? []}
        userId={usuario.id}
        resumo={resumo}
        loteAberto={loteAberto}
      />
    </div>
  );
}
