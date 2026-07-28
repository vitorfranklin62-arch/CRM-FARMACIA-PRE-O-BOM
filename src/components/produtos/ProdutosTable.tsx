"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Table, type Column } from "@/components/ui/Table";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { ProdutoForm } from "./ProdutoForm";
import type { Produto } from "@/types/database";

export function ProdutosTable({ produtos, isDona }: { produtos: Produto[]; isDona: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [busca, setBusca] = useState("");
  const router = useRouter();

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        p.laboratorio?.toLowerCase().includes(termo) ||
        p.sku?.toLowerCase().includes(termo)
    );
  }, [produtos, busca]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(p: Produto) {
    setEditing(p);
    setFormOpen(true);
  }

  async function handleDelete(p: Produto) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    const supabase = createClient();
    await supabase.from("produtos").delete().eq("id", p.id);
    await logAudit(supabase, "produto_excluido", "produtos", p.id, { nome: p.nome });
    router.refresh();
  }

  const columns: Column<Produto>[] = [
    {
      header: "Produto",
      accessor: (p) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{p.nome}</p>
          {p.laboratorio && <p className="text-xs text-gray-400 dark:text-gray-500">{p.laboratorio}</p>}
        </div>
      ),
    },
    { header: "SKU", accessor: (p) => <span className="text-gray-500 dark:text-gray-400">{p.sku || "—"}</span> },
    { header: "Preço", accessor: (p) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(p.preco)}</span> },
    {
      header: "Estoque",
      accessor: (p) => (
        <Badge variant={p.estoque === 0 ? "red" : p.estoque <= 5 ? "yellow" : "green"}>
          {p.estoque === 0 ? "Sem estoque" : `${p.estoque} un.`}
        </Badge>
      ),
    },
    ...(isDona
      ? [
          {
            header: "",
            accessor: (p: Produto) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => openEdit(p)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
            className: "text-right",
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader
        title="Catálogo de produtos"
        description={`${produtos.length} produto(s) cadastrado(s)`}
        action={
          isDona && (
            <Button size="sm" onClick={openNew}>
              <Plus size={15} /> Novo produto
            </Button>
          )
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, laboratório ou SKU..."
          className="pl-9"
        />
      </div>

      <Table
        columns={columns}
        data={filtrados}
        keyField={(p) => p.id}
        emptyMessage={produtos.length === 0 ? "Nenhum produto cadastrado ainda." : "Nenhum produto encontrado."}
      />

      {isDona && <ProdutoForm open={formOpen} onClose={() => setFormOpen(false)} produto={editing} />}
    </Card>
  );
}
