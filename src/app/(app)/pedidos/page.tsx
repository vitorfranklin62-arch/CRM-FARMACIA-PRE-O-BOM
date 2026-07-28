import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PedidosBoard } from "@/components/pedidos/PedidosBoard";
import type { PedidoCompleto } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("pedidos")
    .select("*, clientes(*), itens_pedido(*, produtos(*))")
    .order("criado_em", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Pedidos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Fila de separação — arraste o pedido até a entrega.</p>
      </div>

      <PedidosBoard initialPedidos={(data as PedidoCompleto[]) ?? []} />
    </div>
  );
}
