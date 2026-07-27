import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CampanhasList } from "@/components/campanhas/CampanhasList";
import type { Campanha } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CampanhasPage() {
  const usuario = await requireDona();
  const supabase = await createClient();

  const { data } = await supabase.from("campanhas").select("*").order("criado_em", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Campanhas</h1>
        <p className="text-sm text-gray-500">Crie e agende campanhas de mensagens para seus clientes.</p>
      </div>

      <CampanhasList campanhas={(data as Campanha[]) ?? []} userId={usuario.id} />
    </div>
  );
}
