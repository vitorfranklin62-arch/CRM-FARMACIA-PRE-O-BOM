"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { criarUsuarioAction, type ActionState } from "@/app/(app)/configuracoes/actions";

const initialState: ActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando..." : "Criar usuário"}
    </Button>
  );
}

export function NovoUsuarioForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction] = useFormState(criarUsuarioAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal open={open} onClose={onClose} title="Novo usuário">
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" required maxLength={200} />
        </div>
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required maxLength={255} />
        </div>
        <div>
          <Label htmlFor="password">Senha provisória</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>
        <div>
          <Label htmlFor="role">Função</Label>
          <Select id="role" name="role" defaultValue="funcionaria">
            <option value="funcionaria">Funcionária</option>
            <option value="dona">Dona</option>
          </Select>
        </div>
        {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  );
}
