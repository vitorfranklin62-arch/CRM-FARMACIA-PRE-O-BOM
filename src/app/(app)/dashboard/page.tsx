import { DollarSign, ShoppingBag, Package, UserPlus, ListChecks, Receipt, PackageSearch, PackageX } from "lucide-react";
import { requireDona } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";
import { RevenueChart, OrdersChart } from "@/components/dashboard/DashboardCharts";
import { UltimosPedidos } from "@/components/dashboard/UltimosPedidos";
import { formatCurrency } from "@/lib/utils";
import { getDashboardData } from "./data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireDona();
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Visão geral do dia na Farmácia Preço Bom.</p>
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

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Agora na farmácia
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pedidos em aberto"
            value={String(data.pedidosAtivos)}
            caption="fila ativa agora"
            icon={<ListChecks size={18} />}
          />
          <StatCard
            label="Ticket médio hoje"
            value={formatCurrency(data.ticketMedio)}
            caption="por venda"
            icon={<Receipt size={18} />}
          />
          <StatCard
            label="Encomendas aguardando"
            value={String(data.encomendasPendentes)}
            caption="a caminho ou pra avisar"
            icon={<PackageSearch size={18} />}
          />
          <StatCard
            label="Produtos zerados"
            value={String(data.produtosZerados)}
            caption="sem estoque agora"
            icon={<PackageX size={18} />}
          />
        </div>
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

      <UltimosPedidos pedidos={data.ultimosPedidos} />
    </div>
  );
}
