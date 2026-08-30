import { ClipboardList, MoveHorizontal } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PedidosBoard } from "@/components/pedidos/PedidosBoard";
import type { PedidoCompleto } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  await requireUser();
  const supabase = await createClient();

  // Busca ativos (novo/separando/pronto) e entregues em consultas separadas
  // — sem isso, entregues antigos indo se acumulando podiam "empurrar" pra
  // fora do limite os pedidos ativos de verdade que ainda precisam de
  // atenção. A janela de 2 dias nos entregues é só uma folga de fuso
  // horário; o filtro fino de "hoje" acontece no PedidosBoard.
  const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [ativosRes, entreguesRes] = await Promise.all([
    supabase
      .from("pedidos")
      .select("*, clientes(*), itens_pedido(*, produtos(*))")
      .neq("status", "entregue")
      .order("criado_em", { ascending: false })
      .limit(200),
    supabase
      .from("pedidos")
      .select("*, clientes(*), itens_pedido(*, produtos(*))")
      .eq("status", "entregue")
      .gte("atualizado_em", doisDiasAtras)
      .order("atualizado_em", { ascending: false })
      .limit(200),
  ]);

  const data = [...(ativosRes.data ?? []), ...(entreguesRes.data ?? [])];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500 px-5 py-6 text-white shadow-card-md">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <ClipboardList size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Pedidos</h1>
            <p className="flex items-center gap-1.5 text-sm text-white/80">
              <MoveHorizontal size={14} className="shrink-0" />
              Arraste o cartão entre as etapas — e solte na barra de{" "}
              <strong className="font-semibold text-white">Finalizar pedido</strong> pra concluir.
            </p>
          </div>
        </div>
      </div>

      <PedidosBoard initialPedidos={data as PedidoCompleto[]} />
    </div>
  );
}
