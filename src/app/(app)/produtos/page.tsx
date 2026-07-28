import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProdutosTable } from "@/components/produtos/ProdutosTable";
import type { Produto } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase.from("produtos").select("*").order("nome");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Produtos</h1>
        <p className="text-sm text-gray-500">
          Catálogo consultado pela IA no atendimento — preço e estoque precisam estar sempre atualizados.
        </p>
      </div>

      <ProdutosTable produtos={(data as Produto[]) ?? []} isDona={usuario.role === "dona"} />
    </div>
  );
}
