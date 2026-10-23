-- ============================================================================
-- Chat ao vivo: classificação do atendimento + contador de não lidas
--
-- Duas funcionalidades novas pro Chat ao vivo, no estilo do WhatsApp Business:
-- 1. Classificação do atendimento (aberta / aguardando o cliente / resolvida),
--    escolhida pela equipe. É SEPARADA de conversas.status de propósito:
--    `status` é o controle da IA (aberta = IA responde, aguardando_humano =
--    IA travada) e é lido pelo N8N via deve_ia_responder(). Misturar os dois
--    faria "marcar como resolvida" mexer sem querer em quem responde o cliente.
-- 2. Contador de mensagens do cliente ainda não lidas no painel (filtro
--    "Não lidos" e bolinha verde na lista de conversas). Zera quando alguém
--    abre a conversa no CRM.
--
-- As duas coisas são mantidas por um trigger em `mensagens`, então funcionam
-- pra qualquer mensagem que chegar (webhook do N8N ou painel) sem precisar
-- mudar o fluxo do N8N.
--
-- Esta migração só ADICIONA coisas — nenhuma coluna, tabela ou dado é
-- removido. Único dado existente tocado: conversas já "fechadas" começam
-- classificadas como "resolvida" (as demais ficam "aberta", o padrão).
-- Rodar no SQL editor do Supabase.
-- ============================================================================

alter table conversas add column if not exists classificacao text not null default 'aberta'
  check (classificacao in ('aberta', 'aguardando_cliente', 'resolvida'));
alter table conversas add column if not exists nao_lidas integer not null default 0;

comment on column conversas.classificacao is
  'Classificação do atendimento escolhida pela equipe no Chat ao vivo: aberta, aguardando_cliente ou resolvida. Não controla a IA (isso é conversas.status). Volta pra "aberta" sozinha quando o cliente manda mensagem nova.';
comment on column conversas.nao_lidas is
  'Mensagens do cliente que ninguém abriu no painel ainda. Incrementado pelo trigger trg_mensagens_conversa_resumo, zerado ao abrir a conversa no CRM.';

create index if not exists idx_conversas_classificacao on conversas (classificacao);

-- ----------------------------------------------------------------------------
-- Trigger: mensagem nova do cliente → +1 não lida e reabre o atendimento
-- ----------------------------------------------------------------------------
-- "Aguardando o cliente" e "Resolvida" voltam pra "Aberta" quando o cliente
-- responde — igual etiqueta de atendimento do WhatsApp Business: a conversa
-- não fica escondida no filtro errado depois que o cliente volta a falar.
create or replace function atualizar_resumo_conversa()
returns trigger as $$
begin
  if new.remetente = 'cliente' then
    update conversas
    set nao_lidas = nao_lidas + 1,
        classificacao = 'aberta'
    where id = new.conversa_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mensagens_conversa_resumo on mensagens;
create trigger trg_mensagens_conversa_resumo after insert on mensagens
  for each row execute function atualizar_resumo_conversa();

-- ----------------------------------------------------------------------------
-- Ordem da lista: abrir a conversa ou trocar a classificação não "sobe" ela
-- ----------------------------------------------------------------------------
-- A lista do Chat ao vivo é ordenada por atualizado_em, e o trigger genérico
-- set_atualizado_em() carimba now() em QUALQUER update. Sem este ajuste, só
-- abrir uma conversa (zerar nao_lidas) ou marcar como resolvida jogaria ela
-- pro topo da lista como se tivesse mensagem nova. Esta versão específica
-- de conversas mantém o atualizado_em antigo quando SÓ esses dois campos
-- mudaram; qualquer outra mudança (inclusive um update explícito de
-- atualizado_em, como o webhook faz) continua carimbando now() como antes.
create or replace function set_atualizado_em_conversas()
returns trigger as $$
begin
  if to_jsonb(new) is distinct from to_jsonb(old)
     and (to_jsonb(new) - 'nao_lidas' - 'classificacao')
       = (to_jsonb(old) - 'nao_lidas' - 'classificacao') then
    new.atualizado_em = old.atualizado_em;
  else
    new.atualizado_em = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_conversas_atualizado_em on conversas;
create trigger trg_conversas_atualizado_em before update on conversas
  for each row execute function set_atualizado_em_conversas();

-- ----------------------------------------------------------------------------
-- Dados existentes
-- ----------------------------------------------------------------------------
-- Conversas antigas já encerradas entram como resolvidas, pra o filtro
-- "Resolvido" já nascer fazendo sentido. Fica no fim de propósito: com o
-- trigger acima já trocado, este update não mexe na ordem da lista.
update conversas set classificacao = 'resolvida'
where status = 'fechada' and classificacao = 'aberta';
