"use client";

import { Loader2, Phone, Clock, Package, GripVertical, CheckCircle2, ArrowRight, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime, formatRelativeTime, cn } from "@/lib/utils";
import { ETAPAS } from "./etapas";
import type { EncomendaComCliente } from "@/types/relations";
import type { EncomendaStatus } from "@/types/database";

const PROXIMO_STATUS: Partial<
  Record<EncomendaStatus, { status: EncomendaStatus; label: string; titulo?: string }>
> = {
  pendente: {
    status: "chegou",
    label: "Marcar chegou",
    titulo: "Marca como chegou e avisa o cliente no WhatsApp",
  },
  chegou: { status: "entregue", label: "Finalizar encomenda" },
};

// Elementos que respondem a clique não podem virar "pega" do arrasto,
// senão cancelar/avançar status deixava de funcionar.
const INTERATIVOS = "button, a, input, textarea, select, [role='button']";

export function EncomendaCard({
  encomenda,
  onUpdateStatus,
  updating,
  aoIniciarArrasto,
  arrastando = false,
  fantasma = false,
}: {
  encomenda: EncomendaComCliente;
  onUpdateStatus: (id: string, status: EncomendaStatus) => void;
  updating: boolean;
  aoIniciarArrasto?: (evento: React.PointerEvent) => void;
  /** Cartão original enquanto uma cópia dele acompanha o ponteiro. */
  arrastando?: boolean;
  /** Cópia que segue o ponteiro — não recebe eventos. */
  fantasma?: boolean;
}) {
  const proximo = PROXIMO_STATUS[encomenda.status];
  const podeCancelar = encomenda.status === "pendente" || encomenda.status === "chegou";
  const finalizada = encomenda.status === "entregue";
  // Cancelada não tem coluna própria, então nunca chega a ser desenhada aqui;
  // o fallback é só pro TypeScript não precisar de asserção.
  const etapa = ETAPAS[encomenda.status === "cancelada" ? "pendente" : encomenda.status];

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
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-gray-100 bg-white py-4 pl-5 pr-4 shadow-card transition",
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
            title="Arraste para mover a encomenda"
          >
            <GripVertical size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
              {encomenda.clientes?.nome ?? "Cliente"}
            </p>
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
              {formatRelativeTime(encomenda.criado_em)}
            </p>
          </div>
        </div>
        {encomenda.status === "chegou" && (
          <Badge variant="green" className="shrink-0">
            <BellRing size={11} /> Avisado
          </Badge>
        )}
        {finalizada && (
          <Badge variant="gray" className="shrink-0">
            Retirada
          </Badge>
        )}
      </div>

      <div className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/70 p-2.5 text-xs ring-1 ring-inset ring-gray-100 dark:from-white/5 dark:to-white/[0.02] dark:ring-white/10">
        <p className="flex items-start gap-1.5 font-semibold text-gray-800 dark:text-gray-100">
          <Package size={13} className="mt-0.5 shrink-0 text-brand-500" />
          <span>
            <span className="font-bold">{encomenda.quantidade}x</span> {encomenda.produto_nome}
          </span>
        </p>
        {encomenda.observacoes && (
          <p className="mt-1 pl-[18px] text-gray-500 dark:text-gray-400">{encomenda.observacoes}</p>
        )}
      </div>

      <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
        {encomenda.clientes?.telefone && (
          <p className="flex items-center gap-1.5">
            <Phone size={13} className="shrink-0 text-emerald-500" />
            {encomenda.clientes.telefone}
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <Clock size={13} className="shrink-0 text-sky-500" />
          {formatDateTime(encomenda.criado_em)}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-white/10">
        {podeCancelar ? (
          <button
            type="button"
            onClick={() => onUpdateStatus(encomenda.id, "cancelada")}
            disabled={updating}
            className="rounded-lg px-1.5 py-1 text-xs font-medium text-gray-400 transition hover:bg-accent-50 hover:text-accent-600 disabled:opacity-50 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-accent-400"
          >
            Cancelar
          </button>
        ) : (
          <span />
        )}
        {finalizada && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <CheckCircle2 size={13} /> Finalizada
          </span>
        )}
        {proximo && (
          <button
            type="button"
            disabled={updating}
            title={proximo.titulo}
            onClick={() => onUpdateStatus(encomenda.id, proximo.status)}
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
    </article>
  );
}
