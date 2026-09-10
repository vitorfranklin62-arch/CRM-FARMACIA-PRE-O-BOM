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

/**
 * Importação de estoque, etapa 2 (gravação em lotes). O navegador manda de
 * volta as linhas que o servidor montou na etapa 1, então aqui a validação
 * serve pra duas coisas: garantir que os números continuam números e, mais
 * importante, deixar passar só as colunas de `produtos` que a importação
 * pode tocar — o zod descarta qualquer outro campo que venha no corpo.
 */
export const importacaoLinhaSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(100).nullable().optional(),
  nome: z.string().trim().min(1).max(300).optional(),
  laboratorio: z.string().trim().max(200).nullable().optional(),
  custo: z.number().nonnegative().optional(),
  estoque: z.number().int().optional(),
  preco: z.number().nonnegative().optional(),
  observacoes: z.string().max(5000).nullable().optional(),
});

export const importarEstoqueLoteSchema = z.object({
  modo: z.enum(["atualizar_por_id", "atualizar_por_sku", "criar"]),
  /**
   * Validadas uma a uma na rota (não aqui): uma linha estranha no meio do
   * arquivo vira erro só dela, sem derrubar o lote inteiro de ~250 boas.
   * Pode vir vazio no lote final, que só fecha a importação (resumo).
   */
  linhas: z.array(z.unknown()).max(1000),
  /** Só no último lote: fecha a importação registrando o resumo na auditoria. */
  resumo: z
    .object({
      arquivo: z.string().trim().min(1).max(300),
      formato: z.enum(["pdf", "xlsx", "fp3"]),
      total: z.number().int().nonnegative(),
      atualizados: z.number().int().nonnegative(),
      criados: z.number().int().nonnegative(),
      erros: z.number().int().nonnegative(),
      ignoradas: z.number().int().nonnegative(),
    })
    .optional(),
});

/**
 * Remoção dos produtos que não estão no arquivo de estoque importado.
 * Só ids: quem decide o que entra nessa lista é a etapa de leitura do
 * arquivo, e a tela ainda pede confirmação antes de mandar o primeiro lote.
 */
export const importarEstoqueRemoverSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  arquivo: z.string().trim().min(1).max(300),
});
