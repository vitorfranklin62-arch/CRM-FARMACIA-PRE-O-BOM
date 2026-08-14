import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(200),
});

export const pedidoItemWebhookSchema = z.object({
  produto_id: z.string().uuid().nullable().optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  nome: z.string().trim().max(300).nullable().optional(),
  quantidade: z.number().int().positive(),
  preco_unitario: z.number().nonnegative(),
});

// Campos opcionais aceitam `null` além de ausentes — o agente de IA que
// preenche esses webhooks (via tool-calling no N8N) costuma mandar `null`
// explícito pra "sem valor" (ex.: pedido de retirada na loja sem
// endereco_entrega) em vez de simplesmente omitir a chave.
export const pedidoWebhookSchema = z.object({
  cliente: z.object({
    id: z.string().uuid().nullable().optional(),
    nome: z.string().trim().min(1).max(200),
    telefone: z.string().trim().min(8).max(30),
    origem_chat: z.enum(["whatsapp", "instagram"]).nullable().optional(),
    foto_url: z.string().trim().url("URL inválida").max(2000).nullable().optional(),
  }),
  itens: z.array(pedidoItemWebhookSchema).min(1),
  total: z.number().nonnegative().nullable().optional(),
  endereco_entrega: z.string().trim().max(500).nullable().optional(),
  telefone_confirmacao: z.string().trim().max(30).nullable().optional(),
  pagamento_status: z.enum(["pendente", "confirmado"]).nullable().optional(),
  forma_pagamento: z.string().trim().max(100).nullable().optional(),
  taxa_entrega: z.number().nonnegative().nullable().optional(),
});

export const clienteWebhookSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  telefone: z.string().trim().min(8).max(30),
  origem_chat: z.enum(["whatsapp", "instagram"]).nullable().optional(),
  foto_url: z.string().trim().url("URL inválida").max(2000).nullable().optional(),
});

export const campanhaStatusWebhookSchema = z.object({
  status: z.enum(["rascunho", "agendada", "enviada"]),
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
    id: z.string().uuid().nullable().optional(),
    nome: z.string().trim().min(1).max(200),
    telefone: z.string().trim().min(8).max(30),
    origem_chat: z.enum(["whatsapp", "instagram"]).nullable().optional(),
    foto_url: z.string().trim().url("URL inválida").max(2000).nullable().optional(),
  }),
  remetente: z.enum(["ia", "cliente", "funcionaria"]),
  conteudo: z.string().trim().min(1).max(4000),
  conversa_status: z.enum(["aberta", "aguardando_humano", "fechada"]).nullable().optional(),
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

export const vitrineItemCreateSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(1000).nullable().optional(),
  tag: z.string().trim().max(40).nullable().optional(),
  preco: z.number().nonnegative(),
  imagem_url: z.string().trim().url().max(2000).nullable().optional(),
  video_url: z.string().trim().url().max(2000).nullable().optional(),
  ordem: z.number().int(),
  ativo: z.boolean(),
});

export const clienteCreateSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  telefone: z.string().trim().min(8).max(30),
  origem_chat: z.enum(["whatsapp", "instagram"]).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const clienteUpdateSchema = z.object({
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const encomendaCreateSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  telefone: z.string().trim().min(8).max(30),
  produto_nome: z.string().trim().min(1).max(300),
  quantidade: z.number().int().positive().max(9999),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const encomendaStatusSchema = z.object({
  status: z.enum(["pendente", "chegou", "entregue", "cancelada"]),
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

export const consultaFarmaceuticaSchema = z.object({
  pergunta: z.string().trim().min(3, "Escreva a pergunta completa.").max(500),
});

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
