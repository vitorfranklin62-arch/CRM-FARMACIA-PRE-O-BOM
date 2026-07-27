import { createClient } from "@/lib/supabase/server";
import { trendPercent } from "@/lib/utils";
import type { DailyPoint } from "@/components/dashboard/DashboardCharts";

function dayRange(daysAgo: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function getDashboardData() {
  const supabase = await createClient();

  const today = dayRange(0);
  const yesterday = dayRange(1);
  const sevenDaysAgo = dayRange(6).start;

  const [
    vendasHoje,
    vendasOntem,
    vendas7dias,
    pedidosHoje,
    pedidosOntem,
    pedidos7dias,
    clientesHoje,
    clientesOntem,
  ] = await Promise.all([
    supabase.from("vendas_log").select("valor_total").eq("data_venda", toDateStr(today.start)),
    supabase.from("vendas_log").select("valor_total").eq("data_venda", toDateStr(yesterday.start)),
    supabase.from("vendas_log").select("valor_total, data_venda").gte("data_venda", toDateStr(sevenDaysAgo)),
    supabase.from("pedidos").select("id").gte("criado_em", today.start.toISOString()).lt("criado_em", today.end.toISOString()),
    supabase.from("pedidos").select("id").gte("criado_em", yesterday.start.toISOString()).lt("criado_em", yesterday.end.toISOString()),
    supabase.from("pedidos").select("id, criado_em").gte("criado_em", sevenDaysAgo.toISOString()),
    supabase.from("clientes").select("id").gte("criado_em", today.start.toISOString()).lt("criado_em", today.end.toISOString()),
    supabase.from("clientes").select("id").gte("criado_em", yesterday.start.toISOString()).lt("criado_em", yesterday.end.toISOString()),
  ]);

  const sumValor = (rows: { valor_total: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.valor_total), 0);

  const faturamentoHoje = sumValor(vendasHoje.data as { valor_total: number }[] | null);
  const faturamentoOntem = sumValor(vendasOntem.data as { valor_total: number }[] | null);
  const vendasCountHoje = vendasHoje.data?.length ?? 0;
  const vendasCountOntem = vendasOntem.data?.length ?? 0;
  const pedidosCountHoje = pedidosHoje.data?.length ?? 0;
  const pedidosCountOntem = pedidosOntem.data?.length ?? 0;
  const clientesCountHoje = clientesHoje.data?.length ?? 0;
  const clientesCountOntem = clientesOntem.data?.length ?? 0;

  const chartMap = new Map<string, DailyPoint>();
  for (let i = 6; i >= 0; i--) {
    const { start } = dayRange(i);
    const key = toDateStr(start);
    chartMap.set(key, {
      dia: start.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      faturamento: 0,
      pedidos: 0,
    });
  }

  for (const row of (vendas7dias.data as { valor_total: number; data_venda: string }[] | null) ?? []) {
    const point = chartMap.get(row.data_venda);
    if (point) point.faturamento += Number(row.valor_total);
  }

  for (const row of (pedidos7dias.data as { id: string; criado_em: string }[] | null) ?? []) {
    const key = row.criado_em.slice(0, 10);
    const point = chartMap.get(key);
    if (point) point.pedidos += 1;
  }

  return {
    faturamento: { hoje: faturamentoHoje, trend: trendPercent(faturamentoHoje, faturamentoOntem) },
    vendas: { hoje: vendasCountHoje, trend: trendPercent(vendasCountHoje, vendasCountOntem) },
    pedidos: { hoje: pedidosCountHoje, trend: trendPercent(pedidosCountHoje, pedidosCountOntem) },
    clientesNovos: { hoje: clientesCountHoje, trend: trendPercent(clientesCountHoje, clientesCountOntem) },
    chartData: Array.from(chartMap.values()),
  };
}
