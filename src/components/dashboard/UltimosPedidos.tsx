import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import type { PedidoCompleto } from "@/types/relations";
import type { PedidoStatus } from "@/types/database";

const STATUS_LABEL: Record<PedidoStatus, string> = {
  novo: "Pronto pra separar",
  separando: "Separando",
  pronto: "Pronto",
  entregue: "Entregue",
};

const STATUS_VARIANT: Record<PedidoStatus, "blue" | "yellow" | "green" | "gray"> = {
  novo: "blue",
  separando: "yellow",
  pronto: "green",
  entregue: "gray",
};

export function UltimosPedidos({ pedidos }: { pedidos: PedidoCompleto[] }) {
  return (
    <Card>
      <CardHeader
        title="Últimos pedidos"
        description="Os 5 mais recentes, de todos os status."
        action={
          <Link
            href="/pedidos"
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Ver fila <ArrowRight size={13} />
          </Link>
        }
      />

      {pedidos.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Nenhum pedido ainda.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-white/10">
          {pedidos.map((pedido) => (
            <div key={pedido.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {pedido.clientes?.nome ?? "Cliente"}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(pedido.criado_em)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant={STATUS_VARIANT[pedido.status]}>{STATUS_LABEL[pedido.status]}</Badge>
                <span className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {formatCurrency(pedido.total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
