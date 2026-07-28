"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, UserCog } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NovoUsuarioForm } from "./NovoUsuarioForm";
import { alternarAtivoUsuarioAction, removerUsuarioAction } from "@/app/(app)/configuracoes/actions";
import type { Usuario } from "@/types/database";

export function UsuariosSection({ usuarios, currentUserId }: { usuarios: Usuario[]; currentUserId: string }) {
  const [formOpen, setFormOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleAtivo(usuario: Usuario) {
    setPendingId(usuario.id);
    startTransition(async () => {
      await alternarAtivoUsuarioAction(usuario.id, !usuario.ativo);
      setPendingId(null);
    });
  }

  function remover(usuario: Usuario) {
    if (usuario.id === currentUserId) return;
    if (!confirm(`Remover o acesso de ${usuario.nome}?`)) return;
    setPendingId(usuario.id);
    startTransition(async () => {
      await removerUsuarioAction(usuario.id);
      setPendingId(null);
    });
  }

  const columns: Column<Usuario>[] = [
    {
      header: "Nome",
      accessor: (u) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{u.nome}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{u.email}</p>
        </div>
      ),
    },
    {
      header: "Função",
      accessor: (u) => <Badge variant={u.role === "dona" ? "purple" : "blue"}>{u.role === "dona" ? "Dona" : "Funcionária"}</Badge>,
    },
    {
      header: "Status",
      accessor: (u) => (
        <button
          onClick={() => toggleAtivo(u)}
          disabled={isPending && pendingId === u.id}
          className="disabled:opacity-50"
        >
          <Badge variant={u.ativo ? "green" : "gray"}>{u.ativo ? "Ativo" : "Desativado"}</Badge>
        </button>
      ),
    },
    {
      header: "",
      accessor: (u) => (
        <button
          onClick={() => remover(u)}
          disabled={u.id === currentUserId || (isPending && pendingId === u.id)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={13} /> Remover
        </button>
      ),
      className: "text-right",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Usuários"
        description="Dona e funcionárias com acesso ao painel."
        action={
          <div className="flex items-center gap-2">
            <div className="hidden h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 sm:flex">
              <UserCog size={18} />
            </div>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus size={15} /> Adicionar usuário
            </Button>
          </div>
        }
      />
      <Table columns={columns} data={usuarios} keyField={(u) => u.id} emptyMessage="Nenhum usuário cadastrado." />
      <NovoUsuarioForm open={formOpen} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
