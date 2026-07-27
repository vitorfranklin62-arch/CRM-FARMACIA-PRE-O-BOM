import { History } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/utils";
import type { AuditAcao } from "@/types/database";
import type { AuditLogComUsuario } from "@/types/relations";

const ACAO_LABEL: Record<AuditAcao, string> = {
  pedido_status_atualizado: "Atualizou status de pedido",
  cliente_observacao_atualizada: "Editou observação de cliente",
  template_criado: "Criou template",
  template_atualizado: "Editou template",
  template_excluido: "Excluiu template",
  campanha_criada: "Criou campanha",
  campanha_atualizada: "Editou campanha",
  campanha_excluida: "Excluiu campanha",
  configuracoes_atualizadas: "Atualizou dados da farmácia",
  usuario_criado: "Criou usuária",
  usuario_status_alterado: "Ativou/desativou usuária",
  usuario_removido: "Removeu usuária",
  senha_alterada: "Alterou a própria senha",
};

const ENTIDADE_LABEL: Record<string, string> = {
  pedidos: "Pedido",
  clientes: "Cliente",
  templates_mensagem: "Template",
  campanhas: "Campanha",
  configuracoes: "Configurações",
  usuarios: "Usuária",
};

export function AtividadeSection({ logs }: { logs: AuditLogComUsuario[] }) {
  const columns: Column<AuditLogComUsuario>[] = [
    {
      header: "Quando",
      accessor: (l) => <span className="text-gray-500">{formatDateTime(l.criado_em)}</span>,
    },
    {
      header: "Quem",
      accessor: (l) => <span className="font-medium text-gray-900">{l.usuarios?.nome ?? "Sistema"}</span>,
    },
    {
      header: "Ação",
      accessor: (l) => ACAO_LABEL[l.acao] ?? l.acao,
    },
    {
      header: "Onde",
      accessor: (l) => <span className="text-gray-500">{ENTIDADE_LABEL[l.entidade] ?? l.entidade}</span>,
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Atividade recente"
        description="Registro das últimas ações realizadas no painel."
        action={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <History size={18} />
          </div>
        }
      />
      <Table columns={columns} data={logs} keyField={(l) => l.id} emptyMessage="Nenhuma atividade registrada ainda." />
    </Card>
  );
}
