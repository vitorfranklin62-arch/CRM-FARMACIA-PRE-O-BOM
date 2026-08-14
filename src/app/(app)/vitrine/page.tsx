import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VitrineSection } from "@/components/vitrine/VitrineSection";
import type { VitrineItem } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function VitrinePage() {
  await requireDona();
  const supabase = await createClient();

  const { data } = await supabase.from("vitrine_itens").select("*").order("ordem", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Vitrine</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Promoções e produtos em destaque no site — o que aparece aqui é o que os clientes veem em farmaciaprecobom.com.br.
        </p>
      </div>

      <VitrineSection itens={(data as VitrineItem[]) ?? []} />
    </div>
  );
}
