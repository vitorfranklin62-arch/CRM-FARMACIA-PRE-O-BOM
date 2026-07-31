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
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Pedidos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Fila de separação — arraste o pedido até a entrega.</p>
      </div>

      <PedidosBoard initialPedidos={data as PedidoCompleto[]} />
    </div>
  );
}
