import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { selecionarTodos } from "@/lib/supabase/fetch-all";
import { ProdutosTable } from "@/components/produtos/ProdutosTable";
import type { Produto } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const { data } = await selecionarTodos<Produto>((from, to) =>
    supabase.from("produtos").select("*").order("nome").range(from, to)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Produtos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Catálogo consultado pela IA no atendimento — preço e estoque precisam estar sempre atualizados.
        </p>
      </div>

      <ProdutosTable produtos={data} isDona={usuario.role === "dona"} />
    </div>
  );
}
