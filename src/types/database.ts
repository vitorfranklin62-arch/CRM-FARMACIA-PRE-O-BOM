export type UsuarioRole = "dona" | "funcionaria";
export type OrigemChat = "whatsapp" | "instagram";
export type PedidoStatus = "novo" | "separando" | "pronto" | "entregue";
export type EncomendaStatus = "pendente" | "chegou" | "entregue" | "cancelada";
export type PagamentoStatus = "pendente" | "confirmado";
export type ConversaStatus = "aberta" | "aguardando_humano" | "fechada";
export type Remetente = "ia" | "cliente" | "funcionaria";
export type TemplateCategoria = "confirmacao" | "promocao" | "duvida" | "outro";
export type ClientesAlvo = "todos" | "por_filtro";
export type CampanhaStatus = "rascunho" | "agendada" | "enviada";
export type ConfiguracaoTipo = "string" | "number" | "boolean" | "json";

export type Usuario = {
  id: string;
  email: string;
  nome: string;
  role: UsuarioRole;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  origem_chat: OrigemChat | null;
  observacoes: string | null;
  foto_url: string | null;
  ultima_interacao: string | null;
  criado_em: string;
}

export type Produto = {
  id: string;
  nome: string;
  laboratorio: string | null;
  preco: number;
  custo: number | null;
  estoque: number;
  sku: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type Pedido = {
  id: string;
  cliente_id: string;
  status: PedidoStatus;
  total: number | null;
  pagamento_status: PagamentoStatus;
  forma_pagamento: string | null;
  taxa_entrega: number | null;
  endereco_entrega: string | null;
  telefone_confirmacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type Encomenda = {
  id: string;
  cliente_id: string;
  produto_nome: string;
  quantidade: number;
  observacoes: string | null;
  status: EncomendaStatus;
  avisado_em: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type BairroEntrega = {
  id: string;
  bairro: string;
  valor: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type ItemPedido = {
  id: string;
  pedido_id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  criado_em: string;
}

export type Conversa = {
  id: string;
  cliente_id: string;
  pedido_id: string | null;
  status: ConversaStatus;
  criado_em: string;
  atualizado_em: string;
}

export type Mensagem = {
  id: string;
  conversa_id: string;
  remetente: Remetente;
  usuario_id: string | null;
  conteudo: string;
  criado_em: string;
}

export type TemplateMensagem = {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: TemplateCategoria | null;
  criado_em: string;
  atualizado_em: string;
}

export type Campanha = {
  id: string;
  titulo: string;
  mensagem: string;
  clientes_alvo: ClientesAlvo;
  filtro_json: Record<string, unknown> | null;
  agendada_para: string | null;
  status: CampanhaStatus;
  enviada_em: string | null;
  criado_em: string;
  criado_por: string;
}

export type VendaLog = {
  id: string;
  pedido_id: string;
  valor_total: number;
  data_venda: string;
  criado_em: string;
}

export type Configuracao = {
  id: string;
  chave: string;
  valor: string | null;
  tipo: ConfiguracaoTipo | null;
  atualizado_em: string;
}

export type LoginTentativa = {
  id: string;
  email: string;
  sucesso: boolean;
  ip: string | null;
  criado_em: string;
}

export type AuditAcao =
  | "pedido_status_atualizado"
  | "encomenda_criada"
  | "encomenda_status_atualizado"
  | "cliente_criado"
  | "cliente_observacao_atualizada"
  | "template_criado"
  | "template_atualizado"
  | "template_excluido"
  | "campanha_criada"
  | "campanha_atualizada"
  | "campanha_excluida"
  | "configuracoes_atualizadas"
  | "usuario_criado"
  | "usuario_status_alterado"
  | "usuario_removido"
  | "senha_alterada"
  | "produto_criado"
  | "produto_atualizado"
  | "produto_excluido"
  | "campanha_disparada"
  | "estoque_importado"
  | "produtos_duplicados_removidos"
  | "bairro_entrega_criado"
  | "bairro_entrega_atualizado"
  | "bairro_entrega_excluido"
  | "conversas_duplicadas_mescladas";

export type AuditLog = {
  id: string;
  usuario_id: string | null;
  acao: AuditAcao;
  entidade: string;
  entidade_id: string | null;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
}

export type ConsultaFarmaceutica = {
  id: string;
  usuario_id: string | null;
  pergunta: string;
  resposta: string | null;
  criado_em: string;
}

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type TableDef<Row, Relationships extends Relationship[] = [], Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

export interface Database {
  public: {
    Tables: {
      usuarios: TableDef<Usuario>;
      clientes: TableDef<Cliente>;
      produtos: TableDef<Produto>;
      pedidos: TableDef<
        Pedido,
        [
          {
            foreignKeyName: "pedidos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ]
      >;
      itens_pedido: TableDef<
        ItemPedido,
        [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itens_pedido_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ]
      >;
      encomendas: TableDef<
        Encomenda,
        [
          {
            foreignKeyName: "encomendas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encomendas_criado_por_fkey";
            columns: ["criado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ]
      >;
      conversas: TableDef<
        Conversa,
        [
          {
            foreignKeyName: "conversas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversas_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
        ]
      >;
      mensagens: TableDef<
        Mensagem,
        [
          {
            foreignKeyName: "mensagens_conversa_id_fkey";
            columns: ["conversa_id"];
            isOneToOne: false;
            referencedRelation: "conversas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mensagens_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ]
      >;
      templates_mensagem: TableDef<TemplateMensagem>;
      campanhas: TableDef<
        Campanha,
        [
          {
            foreignKeyName: "campanhas_criado_por_fkey";
            columns: ["criado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ]
      >;
      vendas_log: TableDef<VendaLog>;
      bairros_entrega: TableDef<BairroEntrega>;
      configuracoes: TableDef<Configuracao>;
      login_tentativas: TableDef<LoginTentativa>;
      audit_log: TableDef<
        AuditLog,
        [
          {
            foreignKeyName: "audit_log_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ]
      >;
      consultas_farmaceuticas: TableDef<
        ConsultaFarmaceutica,
        [
          {
            foreignKeyName: "consultas_farmaceuticas_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ]
      >;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
