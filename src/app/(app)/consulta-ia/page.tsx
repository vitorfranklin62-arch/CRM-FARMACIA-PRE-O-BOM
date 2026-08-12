import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ConsultaIAPanel } from "@/components/consulta-ia/ConsultaIAPanel";
import { AtlasAvatar } from "@/components/consulta-ia/AtlasAvatar";
import type { ConsultaFarmaceuticaComUsuario } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function ConsultaIAPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("consultas_farmaceuticas")
    .select("*, usuarios(*)")
    .order("criado_em", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <AtlasAvatar size={60} className="shrink-0" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">ATLAS AI</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Referência rápida de contraindicações e nomes genéricos — uso interno da equipe.
          </p>
        </div>
      </div>

      <ConsultaIAPanel
        usuarioNome={usuario.nome}
        historicoInicial={(data as ConsultaFarmaceuticaComUsuario[]) ?? []}
      />
    </div>
  );
}
