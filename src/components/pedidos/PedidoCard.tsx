"use client";

import {
  MapPin,
  Phone,
  Loader2,
  Printer,
  CreditCard,
  Clock,
  Truck,
  GripVertical,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDateTime, formatRelativeTime, cn } from "@/lib/utils";
import { ETAPAS } from "./etapas";
import type { PedidoCompleto } from "@/types/relations";
import type { PedidoStatus } from "@/types/database";

const PROXIMO_STATUS: Partial<Record<PedidoStatus, { status: PedidoStatus; label: string }>> = {
  novo: { status: "separando", label: "Iniciar separação" },
  separando: { status: "pronto", label: "Marcar pronto" },
  pronto: { status: "entregue", label: "Finalizar pedido" },
};

// Elementos que respondem a clique não podem virar "pega" do arrasto,
// senão imprimir/avançar status deixava de funcionar.
const INTERATIVOS = "button, a, input, textarea, select, [role='button']";

export function PedidoCard({
  pedido,
  onUpdateStatus,
  updating,
  aoIniciarArrasto,
  arrastando = false,
  fantasma = false,
}: {
  pedido: PedidoCompleto;
  onUpdateStatus: (id: string, status: PedidoStatus) => void;
  updating: boolean;
  aoIniciarArrasto?: (evento: React.PointerEvent) => void;
  /** Cartão original enquanto uma cópia dele acompanha o ponteiro. */
  arrastando?: boolean;
  /** Cópia que segue o ponteiro — não recebe eventos. */
  fantasma?: boolean;
}) {
  const proximo = PROXIMO_STATUS[pedido.status];
  const etapa = ETAPAS[pedido.status];
  const finalizado = pedido.status === "entregue";

  function aoPressionar(evento: React.PointerEvent) {
    if (!aoIniciarArrasto || fantasma) return;
    const alvo = evento.target as HTMLElement;
    if (alvo.closest(INTERATIVOS)) return;
    // No dedo, só a alça arrasta — assim a rolagem da página continua livre.
    if (evento.pointerType !== "mouse" && !alvo.closest("[data-punho]")) return;
    aoIniciarArrasto(evento);
  }

  return (
    <article
      data-cartao
      onPointerDown={aoPressionar}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-gray-100 bg-white pl-5 pr-4 py-4 shadow-card transition",
        "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:content-['']",
        etapa.cartao,
        "dark:border-white/10 dark:bg-navy-800/70",
        !fantasma && "hover:-translate-y-0.5 hover:shadow-card-md",
        aoIniciarArrasto && !fantasma && "md:cursor-grab md:active:cursor-grabbing",
        arrastando && "pointer-events-none opacity-30 saturate-50",
        fantasma && "pointer-events-none rotate-2 scale-[1.03] shadow-2xl ring-2 ring-brand-400/70 dark:bg-navy-800"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <span
            data-punho
            aria-hidden
            className="-ml-1 mt-0.5 shrink-0 touch-none rounded-md p-0.5 text-gray-300 transition hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing dark:text-gray-600 dark:hover:bg-white/10"
            title="Arraste para mover o pedido"
          >
            <GripVertical size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
              {pedido.clientes?.nome ?? "Cliente"}
            </p>
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
              {formatRelativeTime(pedido.criado_em)}
            </p>
          </div>
        </div>
        <Badge variant={pedido.pagamento_status === "confirmado" ? "green" : "yellow"}>
          {pedido.pagamento_status === "confirmado" ? "Pago" : "Pendente"}
        </Badge>
      </div>

      <ul className="space-y-1 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/70 p-2.5 text-xs text-gray-600 ring-1 ring-inset ring-gray-100 dark:from-white/5 dark:to-white/[0.02] dark:text-gray-300 dark:ring-white/10">
        {pedido.itens_pedido.length === 0 && <li className="text-gray-400 dark:text-gray-500">Sem itens</li>}
        {pedido.itens_pedido.map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span className="truncate">
              <span className="font-semibold text-gray-800 dark:text-gray-100">{item.quantidade}x</span>{" "}
              {item.produtos?.nome ?? "Produto"}
            </span>
            <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
              {formatCurrency(item.quantidade * Number(item.preco_unitario))}
            </span>
          </li>
        ))}
        {pedido.taxa_entrega != null && (
          <li className="flex justify-between gap-2 border-t border-gray-200 pt-1 dark:border-white/10">
            <span className="flex items-center gap-1">
              <Truck size={12} className="shrink-0" /> Taxa de entrega
            </span>
            <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
              {formatCurrency(pedido.taxa_entrega)}
            </span>
          </li>
        )}
      </ul>

      <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
        {pedido.endereco_entrega && (
          <p className="flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0 text-accent-500" />
            <span className="line-clamp-2">{pedido.endereco_entrega}</span>
          </p>
        )}
        {(pedido.telefone_confirmacao || pedido.clientes?.telefone) && (
          <p className="flex items-center gap-1.5">
            <Phone size={13} className="shrink-0 text-emerald-500" />
            {pedido.telefone_confirmacao ?? pedido.clientes?.telefone}
          </p>
        )}
        {pedido.forma_pagamento && (
          <p className="flex items-center gap-1.5">
            <CreditCard size={13} className="shrink-0 text-violet-500" />
            {pedido.forma_pagamento}
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <Clock size={13} className="shrink-0 text-sky-500" />
          {formatDateTime(pedido.criado_em)}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-white/10">
        <span className="text-base font-extrabold tabular-nums text-gray-900 dark:text-white">
          {formatCurrency(Number(pedido.total ?? 0))}
        </span>
        <div className="flex items-center gap-1.5">
          <a
            href={`/pedidos/${pedido.id}/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-white/10"
            title="Imprimir pedido"
          >
            <Printer size={16} />
          </a>
          {finalizado && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <CheckCircle2 size={13} /> Finalizado
            </span>
          )}
          {proximo && (
            <button
              type="button"
              disabled={updating}
              onClick={() => onUpdateStatus(pedido.id, proximo.status)}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                proximo.status === "entregue"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                  : "bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700"
              )}
            >
              {updating ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              {proximo.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
