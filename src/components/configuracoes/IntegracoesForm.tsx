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
}: {
  uaizapUrl: string;
  n8nUrl: string;
  n8nChatWebhookUrl: string;
}) {
  const [state, formAction] = useFormState(updateConfiguracoesAction, initialState);

  return (
    <Card>
      <CardHeader
        title="Integrações"
        description="Conecte o UAIZAP e o N8N que orquestram o atendimento automatizado."
        action={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
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
