import type {
  AuditLog,
  Cliente,
  ClienteTag,
  ConsultaFarmaceutica,
  Conversa,
  Encomenda,
  ItemPedido,
  Mensagem,
  Pedido,
  Produto,
  Tag,
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
  clientes: ClienteComTags | null;
  mensagens?: Mensagem[];
}

export interface MensagemComUsuario extends Mensagem {
  usuarios: Usuario | null;
  // URL assinada (expira sozinha), calculada no servidor a partir de
  // midia_path — nunca vem direto do banco, ver src/lib/chat-midia.ts.
  midia_url?: string | null;
}

export interface AuditLogComUsuario extends AuditLog {
  usuarios: Usuario | null;
}

export interface ConsultaFarmaceuticaComUsuario extends ConsultaFarmaceutica {
  usuarios: Usuario | null;
}

export interface ClienteTagComTag extends ClienteTag {
  tags: Tag | null;
}

export interface ClienteComTags extends Cliente {
  cliente_tags: ClienteTagComTag[];
}
