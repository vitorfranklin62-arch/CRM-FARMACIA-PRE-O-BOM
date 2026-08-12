import type {
  AuditLog,
  Cliente,
  ConsultaFarmaceutica,
  Conversa,
  Encomenda,
  ItemPedido,
  Mensagem,
  Pedido,
  Produto,
  Usuario,
} from "@/types/database";

export interface ItemPedidoComProduto extends ItemPedido {
  produtos: Produto | null;
}

export interface PedidoCompleto extends Pedido {
  clientes: Cliente | null;
  itens_pedido: ItemPedidoComProduto[];
}

export interface EncomendaComCliente extends Encomenda {
  clientes: Cliente | null;
}

export interface ConversaCompleta extends Conversa {
  clientes: Cliente | null;
  mensagens?: Mensagem[];
}

export interface MensagemComUsuario extends Mensagem {
  usuarios: Usuario | null;
}

export interface AuditLogComUsuario extends AuditLog {
  usuarios: Usuario | null;
}

export interface ConsultaFarmaceuticaComUsuario extends ConsultaFarmaceutica {
  usuarios: Usuario | null;
}
