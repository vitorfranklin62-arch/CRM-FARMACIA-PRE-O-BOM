"use client";

import { Loader2, Phone, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import type { EncomendaComCliente } from "@/types/relations";
import type { EncomendaStatus } from "@/types/database";

const NEXT_STATUS: Partial<Record<EncomendaStatus, { status: EncomendaStatus; label: string }>> = {
  pendente: { status: "chegou", label: "Marcar como chegou" },
  chegou: { status: "entregue", label: "Marcar como retirada" },
};

export function EncomendaCard({
  encomenda,
  onUpdateStatus,
  updating,
}: {
  encomenda: EncomendaComCliente;
  onUpdateStatus: (id: string, status: EncomendaStatus) => void;
  updating: boolean;
}) {
  const next = NEXT_STATUS[encomenda.status];
  const podeCancelar = encomenda.status === "pendente" || encomenda.status === "chegou";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{encomenda.clientes?.nome ?? "Cliente"}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(encomenda.criado_em)}</p>
        </div>
        {encomenda.status === "chegou" && <Badge variant="green">Cliente avisado</Badge>}
        {encomenda.status === "entregue" && <Badge variant="gray">Retirada</Badge>}
      </div>

      <div className="rounded-lg bg-gray-50 p-2.5 text-xs dark:bg-white/5">
        <p className="font-medium text-gray-800 dark:text-gray-100">
          {encomenda.quantidade}x {encomenda.produto_nome}
        </p>
        {encomenda.observacoes && <p className="mt-1 text-gray-500 dark:text-gray-400">{encomenda.observacoes}</p>}
      </div>

      <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
        {encomenda.clientes?.telefone && (
          <p className="flex items-center gap-1.5">
            <Phone size={13} className="shrink-0" />
            {encomenda.clientes.telefone}
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <Clock size={13} className="shrink-0" />
          {formatDateTime(encomenda.criado_em)}
        </p>
      </div>

      {(podeCancelar || next) && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-white/10">
          {podeCancelar ? (
            <button
              onClick={() => onUpdateStatus(encomenda.id, "cancelada")}
              disabled={updating}
              className="text-xs font-medium text-gray-400 hover:text-accent-600 disabled:opacity-50 dark:text-gray-500 dark:hover:text-accent-400"
            >
              Cancelar
            </button>
          ) : (
            <span />
          )}
          {next && (
            <Button size="sm" disabled={updating} onClick={() => onUpdateStatus(encomenda.id, next.status)}>
              {updating && <Loader2 size={13} className="animate-spin" />}
              {next.label}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
