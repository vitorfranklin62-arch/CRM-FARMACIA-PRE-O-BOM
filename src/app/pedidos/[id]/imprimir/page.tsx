import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { LogoMark } from "@/components/ui/Logo";
import { ImprimirButton } from "./ImprimirButton";
import type { PedidoCompleto } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function ImprimirPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("pedidos")
    .select("*, clientes(*), itens_pedido(*, produtos(*))")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const pedido = data as PedidoCompleto;

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-black print:p-0">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="font-semibold text-gray-900">Preço Bom</span>
        </div>
        <ImprimirButton />
      </div>

      <div className="mb-1 flex items-center gap-2">
        <LogoMark size={22} className="hidden print:inline" />
        <h1 className="text-xl font-bold">Pedido</h1>
      </div>
      <p className="text-sm text-gray-500">Feito em {formatDateTime(pedido.criado_em)}</p>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="font-semibold text-gray-700">Cliente:</dt>
        <dd>{pedido.clientes?.nome ?? "-"}</dd>

        <dt className="font-semibold text-gray-700">Telefone:</dt>
        <dd>{pedido.telefone_confirmacao ?? pedido.clientes?.telefone ?? "-"}</dd>

        <dt className="font-semibold text-gray-700">Endereço / Retirada:</dt>
        <dd>{pedido.endereco_entrega ?? "Não informado"}</dd>

        <dt className="font-semibold text-gray-700">Forma de pagamento:</dt>
        <dd>{pedido.forma_pagamento ?? "Não informado"}</dd>

        <dt className="font-semibold text-gray-700">Status do pagamento:</dt>
        <dd>{pedido.pagamento_status === "confirmado" ? "Pago" : "Pendente"}</dd>
      </dl>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-1.5 text-left font-semibold">Qtd</th>
            <th className="py-1.5 text-left font-semibold">Produto</th>
            <th className="py-1.5 text-right font-semibold">Preço unit.</th>
            <th className="py-1.5 text-right font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {pedido.itens_pedido.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-center text-gray-400">
                Sem itens
              </td>
            </tr>
          )}
          {pedido.itens_pedido.map((item) => (
            <tr key={item.id} className="border-b border-gray-200">
              <td className="py-1.5">{item.quantidade}x</td>
              <td className="py-1.5">{item.produtos?.nome ?? "Produto"}</td>
              <td className="py-1.5 text-right">{formatCurrency(Number(item.preco_unitario))}</td>
              <td className="py-1.5 text-right">{formatCurrency(item.quantidade * Number(item.preco_unitario))}</td>
            </tr>
          ))}
          {pedido.taxa_entrega != null && (
            <tr className="border-b border-gray-200">
              <td className="py-1.5" colSpan={3}>
                Taxa de entrega
              </td>
              <td className="py-1.5 text-right">{formatCurrency(pedido.taxa_entrega)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-4 text-right text-lg font-bold">Total: {formatCurrency(Number(pedido.total ?? 0))}</p>
    </div>
  );
}
