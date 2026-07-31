import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProdutosTable } from "@/components/produtos/ProdutosTable";
import type { Produto } from "@/types/database";

export const dynamic = "force-dynamic";

const PAGINA = 500;

export default async function ProdutosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  // Carrega só a 1ª página (500) — com catálogo grande, buscar tudo de
  // uma vez deixava a página lenta pra carregar. O resto vem sob demanda
  // pelo botão "Carregar mais" (ProdutosTable), direto do navegador.
  const [{ data }, { count }] = await Promise.all([
    supabase.from("produtos").select("*").order("nome").range(0, PAGINA - 1),
    supabase.from("produtos").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Produtos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Catálogo consultado pela IA no atendimento — preço e estoque precisam estar sempre atualizados.
        </p>
      </div>

      <ProdutosTable
        produtosIniciais={(data as Produto[]) ?? []}
        totalProdutos={count ?? 0}
        paginaTamanho={PAGINA}
        isDona={usuario.role === "dona"}
      />
    </div>
  );
}
