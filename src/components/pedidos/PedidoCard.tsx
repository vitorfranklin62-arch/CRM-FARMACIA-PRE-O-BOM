"use client";

import { MapPin, Phone, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatRelativeTime, maskPhone } from "@/lib/utils";
import type { PedidoCompleto } from "@/types/relations";
import type { PedidoStatus } from "@/types/database";

const NEXT_STATUS: Partial<Record<PedidoStatus, { status: PedidoStatus; label: string }>> = {
  novo: { status: "separando", label: "Iniciar separação" },
  separando: { status: "pronto", label: "Marcar como pronto" },
  pronto: { status: "entregue", label: "Marcar como entregue" },
};

export function PedidoCard({
  pedido,
  onUpdateStatus,
  updating,
}: {
  pedido: PedidoCompleto;
  onUpdateStatus: (id: string, status: PedidoStatus) => void;
  updating: boolean;
}) {
  const next = NEXT_STATUS[pedido.status];

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{pedido.clientes?.nome ?? "Cliente"}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(pedido.criado_em)}</p>
        </div>
        <Badge variant={pedido.pagamento_status === "confirmado" ? "green" : "yellow"}>
          {pedido.pagamento_status === "confirmado" ? "Pago" : "Pendente"}
        </Badge>
      </div>

      <ul className="space-y-1 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
        {pedido.itens_pedido.length === 0 && <li className="text-gray-400 dark:text-gray-500">Sem itens</li>}
        {pedido.itens_pedido.map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span className="truncate">
              {item.quantidade}x {item.produtos?.nome ?? "Produto"}
            </span>
            <span className="shrink-0 text-gray-400 dark:text-gray-500">
              {formatCurrency(item.quantidade * Number(item.preco_unitario))}
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
        {pedido.endereco_entrega && (
          <p className="flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{pedido.endereco_entrega}</span>
          </p>
        )}
        {(pedido.telefone_confirmacao || pedido.clientes?.telefone) && (
          <p className="flex items-center gap-1.5">
            <Phone size={13} className="shrink-0" />
            {maskPhone(pedido.telefone_confirmacao ?? pedido.clientes?.telefone)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-white/10">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(Number(pedido.total ?? 0))}</span>
        {next && (
          <Button size="sm" disabled={updating} onClick={() => onUpdateStatus(pedido.id, next.status)}>
            {updating && <Loader2 size={13} className="animate-spin" />}
            {next.label}
          </Button>
        )}
      </div>
    </Card>
  );
}
