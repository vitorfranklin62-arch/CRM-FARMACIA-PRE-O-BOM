"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Zap } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Label, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { updateConfiguracoesAction, type ActionState } from "@/app/(app)/configuracoes/actions";

const initialState: ActionState = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando..." : "Salvar"}
    </Button>
  );
}

export function IntegracoesForm({
  uaizapUrl,
  n8nUrl,
  n8nChatWebhookUrl,
  n8nCampanhaWebhookUrl,
  siteRevalidateUrl,
}: {
  uaizapUrl: string;
  n8nUrl: string;
  n8nChatWebhookUrl: string;
  n8nCampanhaWebhookUrl: string;
  siteRevalidateUrl: string;
}) {
  const [state, formAction] = useFormState(updateConfiguracoesAction, initialState);

  return (
    <Card>
      <CardHeader
        title="Integrações"
        description="Conecte o UAIZAP e o N8N que orquestram o atendimento automatizado."
        action={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Zap size={18} />
          </div>
        }
      />
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="integracao_uaizap_url">URL/Webhook do UAIZAP</Label>
          <Input id="integracao_uaizap_url" name="integracao_uaizap_url" defaultValue={uaizapUrl} placeholder="https://..." />
        </div>
        <div>
          <Label htmlFor="integracao_n8n_url">URL base do N8N</Label>
          <Input id="integracao_n8n_url" name="integracao_n8n_url" defaultValue={n8nUrl} placeholder="https://..." />
        </div>
        <div>
          <Label htmlFor="integracao_n8n_chat_webhook_url">Webhook do N8N para enviar mensagens do chat</Label>
          <Input
            id="integracao_n8n_chat_webhook_url"
            name="integracao_n8n_chat_webhook_url"
            defaultValue={n8nChatWebhookUrl}
            placeholder="https://seu-n8n.exemplo.com/webhook/enviar-mensagem"
          />
          <p className="mt-1 text-xs text-gray-400">
            Quando uma funcionária responde pelo Chat ao vivo, o painel chama essa URL pra o N8N entregar a
            mensagem via UAIZAP/WhatsApp.
          </p>
        </div>
        <div>
          <Label htmlFor="integracao_n8n_campanha_webhook_url">Webhook do N8N para disparar campanhas</Label>
          <Input
            id="integracao_n8n_campanha_webhook_url"
            name="integracao_n8n_campanha_webhook_url"
            defaultValue={n8nCampanhaWebhookUrl}
            placeholder="https://seu-n8n.exemplo.com/webhook/disparar-campanha"
          />
          <p className="mt-1 text-xs text-gray-400">
            Usado pelo botão &quot;Disparar agora&quot; em Campanhas. Campanhas agendadas também são pegas
            automaticamente pelo N8N no horário marcado.
          </p>
        </div>
        <div>
          <Label htmlFor="site_revalidate_url">URL de revalidação do site (Vitrine)</Label>
          <Input
            id="site_revalidate_url"
            name="site_revalidate_url"
            defaultValue={siteRevalidateUrl}
            placeholder="https://farmaciaprecobom.com.br/api/revalidate"
          />
          <p className="mt-1 text-xs text-gray-400">
            Quando você salva um item em Vitrine, o CRM chama essa URL pra o site público atualizar a página na
            hora, sem esperar a atualização automática por tempo.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Chaves de API e tokens secretos são configurados por variáveis de ambiente no servidor, não aqui.
        </p>
        {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="text-sm text-green-600">Salvo com sucesso.</p>}
        <div className="flex justify-end">
          <SaveButton />
        </div>
      </form>
    </Card>
  );
}
