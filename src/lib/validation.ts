import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(200),
});

export const pedidoItemWebhookSchema = z.object({
  produto_id: z.string().uuid().optional(),
  sku: z.string().trim().max(100).optional(),
  nome: z.string().trim().max(300).optional(),
  quantidade: z.number().int().positive(),
  preco_unitario: z.number().nonnegative(),
});

export const pedidoWebhookSchema = z.object({
  cliente: z.object({
    id: z.string().uuid().optional(),
    nome: z.string().trim().min(1).max(200),
    telefone: z.string().trim().min(8).max(30),
    origem_chat: z.enum(["whatsapp", "instagram"]).optional(),
  }),
  itens: z.array(pedidoItemWebhookSchema).min(1),
  total: z.number().nonnegative().optional(),
  endereco_entrega: z.string().trim().max(500).optional(),
  telefone_confirmacao: z.string().trim().max(30).optional(),
  pagamento_status: z.enum(["pendente", "confirmado"]).optional(),
  forma_pagamento: z.string().trim().max(100).optional(),
  taxa_entrega: z.number().nonnegative().optional(),
});

export const clienteWebhookSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  telefone: z.string().trim().min(8).max(30),
  origem_chat: z.enum(["whatsapp", "instagram"]).optional(),
});

export const campanhaStatusWebhookSchema = z.object({
  status: z.enum(["rascunho", "agendada", "enviada"]),
});

export const siteEventoSchema = z.object({
  tipo: z.enum(["clique_whatsapp", "clique_ifood", "busca"]),
  produto_id: z.string().uuid().nullish(),
  secao: z.enum(["hero", "promocoes", "flutuante", "rodape", "como_comprar"]).nullish(),
  termo: z.string().trim().max(200).nullish(),
});

export const campanhaCreateSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  mensagem: z.string().trim().min(1).max(2000),
  clientes_alvo: z.enum(["todos", "por_filtro"]),
  filtro_json: z.record(z.string(), z.unknown()).nullable().optional(),
  agendada_para: z.string().datetime().nullable().optional(),
});

export const templateCreateSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  conteudo: z.string().trim().min(1).max(2000),
  categoria: z.enum(["confirmacao", "promocao", "duvida", "outro"]).nullable().optional(),
});

export const pedidoStatusSchema = z.object({
  status: z.enum(["novo", "separando", "pronto", "entregue"]),
});

export const mensagemCreateSchema = z.object({
  conversa_id: z.string().uuid(),
  conteudo: z.string().trim().min(1).max(4000),
});

export const mensagemWebhookSchema = z.object({
  cliente: z.object({
    id: z.string().uuid().optional(),
    nome: z.string().trim().min(1).max(200),
    telefone: z.string().trim().min(8).max(30),
    origem_chat: z.enum(["whatsapp", "instagram"]).optional(),
  }),
  remetente: z.enum(["ia", "cliente", "funcionaria"]),
  conteudo: z.string().trim().min(1).max(4000),
  conversa_status: z.enum(["aberta", "aguardando_humano", "fechada"]).optional(),
});

export const produtoCreateSchema = z.object({
  nome: z.string().trim().min(1).max(300),
  laboratorio: z.string().trim().max(200).nullable().optional(),
  preco: z.number().nonnegative(),
  estoque: z.number().int().nonnegative(),
  sku: z.string().trim().max(100).nullable().optional(),
});

export const bairroEntregaCreateSchema = z.object({
  bairro: z.string().trim().min(1).max(150),
  valor: z.number().nonnegative(),
  ativo: z.boolean(),
});

export const clienteUpdateSchema = z.object({
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const usuarioCreateSchema = z.object({
  email: z.string().trim().email().max(255),
  nome: z.string().trim().min(1).max(200),
  role: z.enum(["dona", "funcionaria"]),
  password: z.string().min(8).max(200),
});

export const usuarioUpdateSchema = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  ativo: z.boolean().optional(),
  role: z.enum(["dona", "funcionaria"]).optional(),
});

export const senhaUpdateSchema = z.object({
  senhaAtual: z.string().min(6).max(200),
  novaSenha: z.string().min(8).max(200),
});

export const configuracaoUpdateSchema = z.record(z.string(), z.string());

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
