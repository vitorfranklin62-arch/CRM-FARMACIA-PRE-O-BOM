import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EncomendasBoard } from "@/components/encomendas/EncomendasBoard";
import type { EncomendaComCliente } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function EncomendasPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  // Ativas (pendente/chegou) e entregues recentes em consultas separadas —
  // mesmo motivo do board de Pedidos: sem isso, entregues antigas acumulando
  // podiam empurrar pra fora do limite as encomendas que ainda precisam de
  // atenção. Canceladas não aparecem no board (não têm coluna própria).
  const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [ativasRes, entreguesRes] = await Promise.all([
    supabase
      .from("encomendas")
      .select("*, clientes(*)")
      .in("status", ["pendente", "chegou"])
      .order("criado_em", { ascending: false })
      .limit(200),
    supabase
      .from("encomendas")
      .select("*, clientes(*)")
      .eq("status", "entregue")
      .gte("atualizado_em", doisDiasAtras)
      .order("atualizado_em", { ascending: false })
      .limit(200),
  ]);

  const data = [...(ativasRes.data ?? []), ...(entreguesRes.data ?? [])];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Encomendas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Produtos fora do estoque pedidos especialmente pro cliente — ao marcar como chegou, o cliente é avisado
          automaticamente por WhatsApp.
        </p>
      </div>

      <EncomendasBoard initialEncomendas={data as EncomendaComCliente[]} userId={usuario.id} />
    </div>
  );
}
