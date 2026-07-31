import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FarmaciaForm } from "@/components/configuracoes/FarmaciaForm";
import { IntegracoesForm } from "@/components/configuracoes/IntegracoesForm";
import { SegurancaForm } from "@/components/configuracoes/SegurancaForm";
import { UsuariosSection } from "@/components/configuracoes/UsuariosSection";
import { EntregaSection } from "@/components/configuracoes/EntregaSection";
import { AtividadeSection } from "@/components/configuracoes/AtividadeSection";
import type { BairroEntrega, Configuracao, Usuario } from "@/types/database";
import type { AuditLogComUsuario } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const usuario = await requireDona();
  const supabase = await createClient();

  const [configRes, usuariosRes, bairrosRes, auditRes] = await Promise.all([
    supabase.from("configuracoes").select("*"),
    supabase.from("usuarios").select("*").order("criado_em", { ascending: true }),
    supabase.from("bairros_entrega").select("*").order("bairro", { ascending: true }),
    supabase.from("audit_log").select("*, usuarios(*)").order("criado_em", { ascending: false }).limit(50),
  ]);

  const config = new Map((configRes.data as Configuracao[] | null)?.map((c) => [c.chave, c.valor ?? ""]) ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Dados da farmácia, usuários, segurança e integrações.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <FarmaciaForm
          nome={config.get("farmacia_nome") ?? ""}
          telefone={config.get("farmacia_telefone") ?? ""}
          horario={config.get("farmacia_horario") ?? ""}
        />
        <IntegracoesForm
          uaizapUrl={config.get("integracao_uaizap_url") ?? ""}
          n8nUrl={config.get("integracao_n8n_url") ?? ""}
          n8nChatWebhookUrl={config.get("integracao_n8n_chat_webhook_url") ?? ""}
          n8nCampanhaWebhookUrl={config.get("integracao_n8n_campanha_webhook_url") ?? ""}
        />
      </div>

      <UsuariosSection usuarios={(usuariosRes.data as Usuario[]) ?? []} currentUserId={usuario.id} />

      <EntregaSection bairros={(bairrosRes.data as BairroEntrega[]) ?? []} />

      <div className="xl:max-w-md">
        <SegurancaForm />
      </div>

      <AtividadeSection logs={(auditRes.data as AuditLogComUsuario[]) ?? []} />
    </div>
  );
}
