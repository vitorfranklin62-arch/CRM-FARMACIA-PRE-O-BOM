-- ============================================================================
-- Chat ao vivo: índices para as consultas mais usadas
--
-- 1. Mensagens de uma conversa em ordem de data — usado ao abrir a conversa e
--    na paginação por cursor (carregar as mais antigas ao rolar pra cima).
--    Hoje só existe idx_mensagens_conversa_id, que obriga o banco a ordenar
--    todas as mensagens da conversa a cada abertura.
-- 2. Lista de conversas ordenada pela atualização mais recente (a conversa
--    com mensagem nova sobe pro topo).
--
-- Esta migração só ADICIONA índices — nenhuma coluna, tabela ou dado é
-- alterado ou removido. Pode rodar mais de uma vez sem erro.
-- Rodar no SQL editor do Supabase.
-- ============================================================================

create index if not exists idx_mensagens_conversa_criado
  on mensagens (conversa_id, criado_em desc);

create index if not exists idx_conversas_atualizado_em
  on conversas (atualizado_em desc);
