-- ============================================================================
-- Tags de clientes + controle de quando a IA pode responder
--
-- Três funcionalidades novas pro CRM:
-- 1. Tags reutilizáveis pra classificar clientes (ex.: "VIP", "Inadimplente").
-- 2. Bloqueio permanente da IA por número — diferente da trava por conversa
--    que já existia (conversas.status = 'aguardando_humano', setada quando
--    uma funcionária responde manualmente pelo Chat ao vivo): aqui o número
--    fica bloqueado pra IA em QUALQUER conversa futura, até alguém desbloquear.
-- 3. Uma função só (deve_ia_responder) que o N8N chama via RPC — mesmo
--    padrão já usado por buscar_produtos/calcular_taxa_entrega — antes de
--    gerar qualquer resposta automática. Ela junta as duas travas (bloqueio
--    permanente do número + trava manual da conversa atual) num único lugar,
--    pra o fluxo do N8N não precisar duplicar essa lógica em vários nós.
--
-- Esta migração só ADICIONA coisas — nenhuma coluna, tabela ou dado é
-- removido ou reescrito. Rodar no SQL editor do Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bloqueio permanente da IA por cliente/número
-- ----------------------------------------------------------------------------
-- Default false: nenhum cliente existente é afetado por esta migração.
alter table clientes add column if not exists ia_bloqueada boolean not null default false;
alter table clientes add column if not exists ia_bloqueada_em timestamptz;

comment on column clientes.ia_bloqueada is
  'true = a IA nunca deve responder automaticamente este número, em nenhuma conversa (bloqueio manual pelo CRM). Diferente de conversas.status=aguardando_humano, que trava só a conversa atual.';
comment on column clientes.ia_bloqueada_em is
  'Quando o bloqueio foi ativado. Só histórico — não é tocado ao desbloquear.';

-- ----------------------------------------------------------------------------
-- 2. Tags
-- ----------------------------------------------------------------------------
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Cor limitada às variantes já existentes do componente Badge do painel —
  -- evita cor solta fora do design system.
  cor text not null default 'blue' check (cor in ('blue', 'green', 'yellow', 'gray', 'red', 'purple')),
  criado_em timestamptz not null default now()
);

-- Nome único ignorando maiúsculas/espaço nas pontas (mesmo padrão de
-- idx_bairros_entrega_nome) — evita "VIP" e "vip" virarem tags diferentes.
create unique index if not exists idx_tags_nome on tags (lower(trim(nome)));

create table if not exists cliente_tags (
  cliente_id uuid not null references clientes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (cliente_id, tag_id)
);

create index if not exists idx_cliente_tags_tag_id on cliente_tags (tag_id);

-- ----------------------------------------------------------------------------
-- 3. RLS — tags e cliente_tags seguem o mesmo padrão de `clientes`: qualquer
-- usuário ativo (dona ou funcionária) usa no dia a dia. Só a exclusão da
-- TAG em si (não da associação com um cliente) fica restrita à dona, porque
-- apaga a tag pra todo mundo de uma vez (cascade em cliente_tags).
-- ----------------------------------------------------------------------------
alter table tags enable row level security;
alter table cliente_tags enable row level security;

drop policy if exists tags_select on tags;
create policy tags_select on tags for select
  using (is_usuario_ativo());

drop policy if exists tags_insert on tags;
create policy tags_insert on tags for insert
  with check (is_usuario_ativo());

drop policy if exists tags_update on tags;
create policy tags_update on tags for update
  using (is_usuario_ativo());

drop policy if exists tags_delete on tags;
create policy tags_delete on tags for delete
  using (is_dona());

drop policy if exists cliente_tags_select on cliente_tags;
create policy cliente_tags_select on cliente_tags for select
  using (is_usuario_ativo());

drop policy if exists cliente_tags_insert on cliente_tags;
create policy cliente_tags_insert on cliente_tags for insert
  with check (is_usuario_ativo());

drop policy if exists cliente_tags_delete on cliente_tags;
create policy cliente_tags_delete on cliente_tags for delete
  using (is_usuario_ativo());

-- ----------------------------------------------------------------------------
-- 4. RPC pro N8N: "essa mensagem pode ser respondida pela IA agora?"
-- ----------------------------------------------------------------------------
-- Chamar assim que a mensagem do cliente chegar, ANTES de acionar o agente
-- de IA e ANTES de enviar qualquer resposta automática:
--
--   POST {SUPABASE_URL}/rest/v1/rpc/deve_ia_responder
--   Body: { "telefone_busca": "<telefone do cliente, como veio do WhatsApp>" }
--   → true  = segue normal, a IA pode responder
--   → false = NÃO chamar a IA nem mandar resposta automática (número
--             bloqueado ou conversa travada manualmente pela equipe)
--
-- Número que ainda não é cliente cadastrado (primeira mensagem) retorna
-- true — só passa a poder ser bloqueado depois que já existe um registro.
create or replace function deve_ia_responder(telefone_busca text)
returns boolean as $$
declare
  v_cliente_id uuid;
  v_ia_bloqueada boolean;
  v_status_conversa text;
begin
  select id, ia_bloqueada into v_cliente_id, v_ia_bloqueada
  from clientes
  where telefone = regexp_replace(telefone_busca, '[^0-9]', '', 'g')
  limit 1;

  if v_cliente_id is null then
    return true;
  end if;

  if v_ia_bloqueada then
    return false;
  end if;

  select status into v_status_conversa
  from conversas
  where cliente_id = v_cliente_id
  order by criado_em desc
  limit 1;

  -- 'aguardando_humano' é a trava manual da conversa atual (mesmo campo que
  -- o botão de travar no Chat ao vivo usa). 'aberta' e 'fechada' deixam a
  -- IA responder normalmente (conversa fechada reabre sozinha na próxima
  -- mensagem, ver /api/webhooks/mensagem).
  return coalesce(v_status_conversa, 'aberta') <> 'aguardando_humano';
end;
$$ language plpgsql stable;
