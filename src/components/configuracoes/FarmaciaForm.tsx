"use client";

import { useFormState, useFormStatus } from "react-dom";
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

export function FarmaciaForm({
  nome,
  telefone,
  horario,
}: {
  nome: string;
  telefone: string;
  horario: string;
}) {
  const [state, formAction] = useFormState(updateConfiguracoesAction, initialState);

  return (
    <Card>
      <CardHeader title="Dados da farmácia" description="Informações usadas no atendimento automatizado." />
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="farmacia_nome">Nome da farmácia</Label>
          <Input id="farmacia_nome" name="farmacia_nome" defaultValue={nome} maxLength={200} />
        </div>
        <div>
          <Label htmlFor="farmacia_telefone">Telefone</Label>
          <Input id="farmacia_telefone" name="farmacia_telefone" defaultValue={telefone} maxLength={30} />
        </div>
        <div>
          <Label htmlFor="farmacia_horario">Horário de funcionamento</Label>
          <Input id="farmacia_horario" name="farmacia_horario" defaultValue={horario} maxLength={200} />
        </div>
        {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="text-sm text-green-600">Salvo com sucesso.</p>}
        <div className="flex justify-end">
          <SaveButton />
        </div>
      </form>
    </Card>
  );
}
