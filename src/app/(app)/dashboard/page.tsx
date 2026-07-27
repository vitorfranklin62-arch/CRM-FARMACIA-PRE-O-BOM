import { DollarSign, ShoppingBag, Package, UserPlus } from "lucide-react";
import { requireDona } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";
import { RevenueChart, OrdersChart } from "@/components/dashboard/DashboardCharts";
import { formatCurrency } from "@/lib/utils";
import { getDashboardData } from "./data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireDona();
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Visão geral do dia na Farmácia Preço Bom.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Faturamento do dia"
          value={formatCurrency(data.faturamento.hoje)}
          trend={data.faturamento.trend}
          icon={<DollarSign size={18} />}
        />
        <StatCard
          label="Vendas do dia"
          value={String(data.vendas.hoje)}
          trend={data.vendas.trend}
          icon={<ShoppingBag size={18} />}
        />
        <StatCard
          label="Pedidos processados"
          value={String(data.pedidos.hoje)}
          trend={data.pedidos.trend}
          icon={<Package size={18} />}
        />
        <StatCard
          label="Clientes novos"
          value={String(data.clientesNovos.hoje)}
          trend={data.clientesNovos.trend}
          icon={<UserPlus size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Faturamento" description="Últimos 7 dias" />
          <RevenueChart data={data.chartData} />
        </Card>
        <Card>
          <CardHeader title="Pedidos" description="Últimos 7 dias" />
          <OrdersChart data={data.chartData} />
        </Card>
      </div>
    </div>
  );
}
