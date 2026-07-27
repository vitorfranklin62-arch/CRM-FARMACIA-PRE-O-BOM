import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TemplatesGrid } from "@/components/templates/TemplatesGrid";
import type { TemplateMensagem } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase.from("templates_mensagem").select("*").order("titulo");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Templates</h1>
        <p className="text-sm text-gray-500">Respostas prontas para agilizar o atendimento.</p>
      </div>

      <TemplatesGrid templates={(data as TemplateMensagem[]) ?? []} isDona={usuario.role === "dona"} />
    </div>
  );
}
