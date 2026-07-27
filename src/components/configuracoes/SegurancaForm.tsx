"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Card, CardHeader } from "@/components/ui/Card";
import { Label, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { alterarSenhaAction, type ActionState } from "@/app/(app)/configuracoes/actions";

const initialState: ActionState = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Alterando..." : "Alterar senha"}
    </Button>
  );
}

export function SegurancaForm() {
  const [state, formAction] = useFormState(alterarSenhaAction, initialState);

  return (
    <Card>
      <CardHeader title="Segurança" description="Altere sua senha de acesso ao painel." />
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="senhaAtual">Senha atual</Label>
          <Input id="senhaAtual" name="senhaAtual" type="password" required minLength={6} />
        </div>
        <div>
          <Label htmlFor="novaSenha">Nova senha</Label>
          <Input id="novaSenha" name="novaSenha" type="password" required minLength={8} />
        </div>
        {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="text-sm text-green-600">Senha alterada com sucesso.</p>}
        <div className="flex justify-end">
          <SaveButton />
        </div>
      </form>
    </Card>
  );
}
