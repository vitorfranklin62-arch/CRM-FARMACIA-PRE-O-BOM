import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ClientesTable } from "@/components/clientes/ClientesTable";
import type { Cliente } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("clientes")
    .select("*")
    .order("ultima_interacao", { ascending: false, nullsFirst: false })
    .limit(300);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500">Histórico e observações de cada cliente.</p>
      </div>

      <Card>
        <ClientesTable clientes={(data as Cliente[]) ?? []} />
      </Card>
    </div>
  );
}
