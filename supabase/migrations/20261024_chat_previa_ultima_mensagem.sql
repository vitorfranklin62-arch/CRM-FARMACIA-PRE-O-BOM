-- ============================================================================
-- Chat ao vivo: prévia da última mensagem na lista de conversas
--
-- A lista de conversas passa a mostrar o começo da última mensagem (como no
-- WhatsApp Web) sem precisar buscar as mensagens de cada conversa. Para isso
-- a conversa guarda um resumo da última mensagem, mantido por trigger — vale
-- pra qualquer mensagem que chegar (webhook do N8N, painel, áudio), sem mudar
-- o fluxo do N8N.
--
-- O que esta migração faz:
-- 1. ADICIONA 4 colunas em `conversas` (nenhuma é removida ou alterada).
-- 2. Ensina o trigger de mensagens a preencher essas colunas.
-- 3. Ensina o trigger de atualizado_em a NÃO mudar a ordem da lista quando só
--    o resumo muda (mesma regra que já vale pra nao_lidas e classificacao).
-- 4. Preenche as colunas novas das conversas que já existem, a partir da
--    última mensagem de cada uma. É o único dado existente tocado: só as
--    colunas novas recebem valor; status, ordem, não lidas etc. ficam iguais.
--
-- A prévia guarda só os primeiros 200 caracteres da mensagem.
-- Pode rodar mais de uma vez sem erro. Rodar no SQL editor do Supabase.
-- ============================================================================

alter table conversas add column if not exists ultima_mensagem text;
alter table conversas add column if not exists ultima_mensagem_em timestamptz;
alter table conversas add column if not exists ultima_mensagem_remetente text;
alter table conversas add column if not exists ultima_mensagem_tipo text;

comment on column conversas.ultima_mensagem is
  'Primeiros 200 caracteres da última mensagem da conversa (prévia da lista do Chat ao vivo). Mantido pelo trigger trg_mensagens_conversa_resumo.';
comment on column conversas.ultima_mensagem_em is 'Data da última mensagem da conversa.';
comment on column conversas.ultima_mensagem_remetente is 'Quem mandou a última mensagem: cliente, ia ou funcionaria.';
comment on column conversas.ultima_mensagem_tipo is 'Tipo da última mensagem: texto, imagem, audio ou documento.';

-- ----------------------------------------------------------------------------
-- 1. Ordem da lista: mudar só o resumo não "sobe" a conversa
-- ----------------------------------------------------------------------------
-- Mesma função da migração 20261023_chat_classificacao_e_nao_lidas.sql, com
-- as colunas do resumo na lista de exceções. Vem ANTES do preenchimento
-- abaixo, senão o preenchimento carimbaria now() em todas as conversas e
-- embaralharia a lista.
create or replace function set_atualizado_em_conversas()
returns trigger as $$
begin
  if to_jsonb(new) is distinct from to_jsonb(old)
     and (to_jsonb(new) - 'nao_lidas' - 'classificacao'
          - 'ultima_mensagem' - 'ultima_mensagem_em' - 'ultima_mensagem_remetente' - 'ultima_mensagem_tipo')
       = (to_jsonb(old) - 'nao_lidas' - 'classificacao'
          - 'ultima_mensagem' - 'ultima_mensagem_em' - 'ultima_mensagem_remetente' - 'ultima_mensagem_tipo') then
    new.atualizado_em = old.atualizado_em;
  else
    new.atualizado_em = now();
  end if;
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Trigger de mensagens: resumo da última mensagem + não lidas
-- ----------------------------------------------------------------------------
-- Mantém o comportamento anterior (mensagem do cliente → +1 não lida e
-- reabre a classificação) e passa a atualizar o resumo pra qualquer remetente.
-- Só troca o resumo se a mensagem for a mais recente (uma mensagem atrasada
-- não apaga a prévia de uma mais nova).
create or replace function atualizar_resumo_conversa()
returns trigger as $$
begin
  update conversas
  set nao_lidas = nao_lidas + case when new.remetente = 'cliente' then 1 else 0 end,
      classificacao = case when new.remetente = 'cliente' then 'aberta' else classificacao end,
      ultima_mensagem = case when ultima_mensagem_em is null or new.criado_em >= ultima_mensagem_em
                             then left(new.conteudo, 200) else ultima_mensagem end,
      ultima_mensagem_remetente = case when ultima_mensagem_em is null or new.criado_em >= ultima_mensagem_em
                                       then new.remetente else ultima_mensagem_remetente end,
      ultima_mensagem_tipo = case when ultima_mensagem_em is null or new.criado_em >= ultima_mensagem_em
                                  then new.tipo else ultima_mensagem_tipo end,
      ultima_mensagem_em = greatest(ultima_mensagem_em, new.criado_em)
  where id = new.conversa_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- O trigger em si já existe (trg_mensagens_conversa_resumo, after insert);
-- recriado aqui só pra deixar a migração completa e repetível.
drop trigger if exists trg_mensagens_conversa_resumo on mensagens;
create trigger trg_mensagens_conversa_resumo after insert on mensagens
  for each row execute function atualizar_resumo_conversa();

-- ----------------------------------------------------------------------------
-- 3. Dados existentes: preenche o resumo a partir da última mensagem
-- ----------------------------------------------------------------------------
update conversas c
set ultima_mensagem = left(m.conteudo, 200),
    ultima_mensagem_em = m.criado_em,
    ultima_mensagem_remetente = m.remetente,
    ultima_mensagem_tipo = m.tipo
from (
  select distinct on (conversa_id) conversa_id, conteudo, criado_em, remetente, tipo
  from mensagens
  order by conversa_id, criado_em desc
) m
where m.conversa_id = c.id
  and c.ultima_mensagem_em is distinct from m.criado_em;
