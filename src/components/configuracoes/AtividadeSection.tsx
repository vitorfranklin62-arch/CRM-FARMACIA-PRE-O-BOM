import { History } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/utils";
import type { AuditAcao } from "@/types/database";
import type { AuditLogComUsuario } from "@/types/relations";

const ACAO_LABEL: Record<AuditAcao, string> = {
  pedido_status_atualizado: "Atualizou status de pedido",
  encomenda_criada: "Registrou encomenda",
  encomenda_status_atualizado: "Atualizou status de encomenda",
  cliente_criado: "Cadastrou cliente",
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
  produto_criado: "Criou produto",
  produto_atualizado: "Editou produto",
  produto_excluido: "Excluiu produto",
  campanha_disparada: "Disparou campanha",
  estoque_importado: "Importou arquivo de estoque",
  produtos_duplicados_removidos: "Removeu produtos duplicados",
  bairro_entrega_criado: "Cadastrou bairro de entrega",
  bairro_entrega_atualizado: "Editou bairro de entrega",
  bairro_entrega_excluido: "Removeu bairro de entrega",
  conversas_duplicadas_mescladas: "Mesclou conversas duplicadas",
  clientes_duplicados_mesclados: "Mesclou clientes duplicados",
};

const ENTIDADE_LABEL: Record<string, string> = {
  pedidos: "Pedido",
  encomendas: "Encomenda",
  clientes: "Cliente",
  templates_mensagem: "Template",
  campanhas: "Campanha",
  configuracoes: "Configurações",
  usuarios: "Usuária",
  produtos: "Produto",
  bairros_entrega: "Bairro de entrega",
  conversas: "Conversa",
};

export function AtividadeSection({ logs }: { logs: AuditLogComUsuario[] }) {
  const columns: Column<AuditLogComUsuario>[] = [
    {
      header: "Quando",
      accessor: (l) => <span className="text-gray-500 dark:text-gray-400">{formatDateTime(l.criado_em)}</span>,
    },
    {
      header: "Quem",
      accessor: (l) => <span className="font-medium text-gray-900 dark:text-white">{l.usuarios?.nome ?? "Sistema"}</span>,
    },
    {
      header: "Ação",
      accessor: (l) => ACAO_LABEL[l.acao] ?? l.acao,
    },
    {
      header: "Onde",
      accessor: (l) => <span className="text-gray-500 dark:text-gray-400">{ENTIDADE_LABEL[l.entidade] ?? l.entidade}</span>,
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Atividade recente"
        description="Registro das últimas ações realizadas no painel."
        action={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <History size={18} />
          </div>
        }
      />
      <Table columns={columns} data={logs} keyField={(l) => l.id} emptyMessage="Nenhuma atividade registrada ainda." />
    </Card>
  );
}
