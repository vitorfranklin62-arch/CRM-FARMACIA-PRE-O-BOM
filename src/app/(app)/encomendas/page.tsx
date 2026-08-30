import { PackageSearch, MoveHorizontal } from "lucide-react";
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500 px-5 py-6 text-white shadow-card-md">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <PackageSearch size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Encomendas</h1>
            <p className="text-sm text-white/80">
              Produtos fora do estoque pedidos especialmente pro cliente — ao marcar como chegou, o cliente é avisado
              automaticamente por WhatsApp.
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
              <MoveHorizontal size={14} className="shrink-0" />
              Arraste o cartão entre as etapas — e solte na barra de{" "}
              <strong className="font-semibold text-white">Finalizar encomenda</strong> pra concluir.
            </p>
          </div>
        </div>
      </div>

      <EncomendasBoard initialEncomendas={data as EncomendaComCliente[]} userId={usuario.id} />
    </div>
  );
}
