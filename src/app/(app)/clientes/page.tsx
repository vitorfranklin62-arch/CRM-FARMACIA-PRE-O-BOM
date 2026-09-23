import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ClientesTable } from "@/components/clientes/ClientesTable";
import type { Tag } from "@/types/database";
import type { ClienteComTags } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  await requireUser();
  const supabase = await createClient();

  const [{ data }, { data: tags }] = await Promise.all([
    supabase
      .from("clientes")
      .select("*, cliente_tags(cliente_id, tag_id, criado_em, tags(*))")
      .order("ultima_interacao", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase.from("tags").select("*").order("nome"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titulo-gradiente text-xl font-bold">Clientes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Histórico, tags e observações de cada cliente.</p>
      </div>

      <Card>
        <ClientesTable clientes={(data as ClienteComTags[]) ?? []} tagsDisponiveis={(tags as Tag[]) ?? []} />
      </Card>
    </div>
  );
}
