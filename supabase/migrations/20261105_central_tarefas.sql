-- ============================================================================
-- Central de Tarefas e Automações
--
-- Quando a IA (ou uma automação) encontra algo que não pode resolver sozinha
-- com segurança — pedido parado, produto em falta, reclamação, erro de
-- integração — ela registra uma TAREFA para a equipe, em vez de fingir que
-- resolveu. Esta migração cria:
--
-- 1. `tarefas` — a tarefa em si (título, categoria, prioridade, responsável,
--    cliente/pedido/conversa vinculados, prazo, status, sugestão da IA).
-- 2. `tarefa_historico` — toda mudança de status/responsável/prioridade,
--    gravada por trigger (vale pra mudança feita pelo painel, pela IA ou pelo
--    banco).
-- 3. `abrir_tarefa(jsonb)` — a ÚNICA porta de entrada para criar tarefa
--    automática. Usa `chave_dedup` para nunca abrir duas tarefas abertas para
--    o mesmo problema (ex.: "pedido_atrasado:<id do pedido>").
-- 4. `verificar_pedidos_atrasados()` — automação: pedido parado em "novo" ou
--    "separando" há mais tempo que o limite vira tarefa. Quando o pedido anda
--    (pronto/entregue), a tarefa é concluída sozinha.
-- 5. Agendamento no pg_cron (a cada 15 min), se a extensão estiver disponível.
--
-- Só ADICIONA coisas: nenhuma tabela, coluna ou dado existente é alterado
-- ou removido. Pode rodar mais de uma vez sem erro. Rodar no SQL editor do
-- Supabase ANTES de 20261105_ia_estado_e_recuperacao_22h.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabelas
-- ----------------------------------------------------------------------------
create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(),
  -- Número curto pra equipe falar "tarefa #123" em vez do uuid.
  numero bigint generated always as identity unique,
  titulo text not null check (char_length(titulo) between 3 and 200),
  descricao text check (descricao is null or char_length(descricao) <= 4000),
  categoria text not null default 'outro' check (categoria in (
    'pedido_atrasado', 'produto_indisponivel', 'reclamacao', 'pagamento_pendente',
    'erro_integracao', 'atendimento', 'estoque', 'outro'
  )),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'urgente')),
  status text not null default 'PENDENTE' check (status in (
    'PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_APROVACAO', 'CONCLUIDA', 'CANCELADA'
  )),
  responsavel_id uuid references usuarios(id) on delete set null,
  cliente_id uuid references clientes(id) on delete set null,
  pedido_id uuid references pedidos(id) on delete set null,
  conversa_id uuid references conversas(id) on delete set null,
  -- Quem abriu: a IA do WhatsApp, uma automação do sistema, ou alguém da equipe.
  origem text not null default 'manual' check (origem in ('ia', 'automacao', 'manual', 'sistema')),
  prazo timestamptz,
  observacoes text check (observacoes is null or char_length(observacoes) <= 4000),
  -- Próximo passo sugerido (pela IA ou pela automação). Só sugestão: quem decide é a equipe.
  sugestao_ia text check (sugestao_ia is null or char_length(sugestao_ia) <= 2000),
  -- Identifica o "mesmo problema" pra não abrir tarefa repetida. Ex.: pedido_atrasado:<uuid>.
  chave_dedup text check (chave_dedup is null or char_length(chave_dedup) <= 200),
  -- Detalhes técnicos (ex.: erro de integração). Nunca guardar token/senha aqui.
  contexto jsonb,
  criado_por uuid references usuarios(id) on delete set null,
  concluida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table tarefas is
  'Central de Tarefas: pendências operacionais abertas pela IA, por automações ou pela equipe.';
comment on column tarefas.chave_dedup is
  'Enquanto existir tarefa ABERTA com esta chave, abrir_tarefa() devolve a existente em vez de criar outra.';

-- Só uma tarefa ABERTA por problema. Concluída/cancelada libera a chave
-- (se o problema voltar depois, nasce uma tarefa nova).
create unique index if not exists idx_tarefas_dedup_aberta on tarefas (chave_dedup)
  where chave_dedup is not null and status not in ('CONCLUIDA', 'CANCELADA');
create index if not exists idx_tarefas_status on tarefas (status);
create index if not exists idx_tarefas_criado_em on tarefas (criado_em desc);
create index if not exists idx_tarefas_responsavel on tarefas (responsavel_id);
create index if not exists idx_tarefas_pedido on tarefas (pedido_id);
create index if not exists idx_tarefas_cliente on tarefas (cliente_id);
create index if not exists idx_tarefas_prazo_aberta on tarefas (prazo)
  where status not in ('CONCLUIDA', 'CANCELADA');

create table if not exists tarefa_historico (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  acao text not null,            -- criada, status, responsavel, prioridade, observacao
  de text,
  para text,
  ator text,                     -- usuario:<uuid>, ia, automacao, sistema
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_tarefa_historico_tarefa on tarefa_historico (tarefa_id, criado_em desc);

-- ----------------------------------------------------------------------------
-- 2. Triggers: atualizado_em, concluida_em e histórico
-- ----------------------------------------------------------------------------
drop trigger if exists trg_tarefas_atualizado_em on tarefas;
create trigger trg_tarefas_atualizado_em before update on tarefas
  for each row execute function set_atualizado_em();

create or replace function tarefas_antes_de_gravar()
returns trigger as $$
begin
  if new.status in ('CONCLUIDA', 'CANCELADA') then
    if tg_op = 'INSERT' or old.status not in ('CONCLUIDA', 'CANCELADA') then
      new.concluida_em := now();
    end if;
  else
    new.concluida_em := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tarefas_antes_de_gravar on tarefas;
create trigger trg_tarefas_antes_de_gravar before insert or update on tarefas
  for each row execute function tarefas_antes_de_gravar();

-- O ator vem da sessão (painel) ou, sem sessão (service role), do parâmetro
-- local `app.ator` que as funções do sistema definem antes de gravar.
create or replace function ator_atual()
returns text as $$
  select coalesce(
    'usuario:' || auth.uid()::text,
    nullif(current_setting('app.ator', true), ''),
    'sistema'
  );
$$ language sql stable;

create or replace function registrar_historico_tarefa()
returns trigger as $$
declare
  v_ator text := ator_atual();
begin
  if tg_op = 'INSERT' then
    insert into tarefa_historico (tarefa_id, acao, para, ator, detalhes)
    values (new.id, 'criada', new.status, v_ator,
            jsonb_build_object('origem', new.origem, 'categoria', new.categoria, 'prioridade', new.prioridade));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into tarefa_historico (tarefa_id, acao, de, para, ator) values (new.id, 'status', old.status, new.status, v_ator);
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into tarefa_historico (tarefa_id, acao, de, para, ator)
    values (new.id, 'responsavel', old.responsavel_id::text, new.responsavel_id::text, v_ator);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into tarefa_historico (tarefa_id, acao, de, para, ator) values (new.id, 'prioridade', old.prioridade, new.prioridade, v_ator);
  end if;
  if new.observacoes is distinct from old.observacoes then
    insert into tarefa_historico (tarefa_id, acao, ator) values (new.id, 'observacao', v_ator);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_tarefas_historico on tarefas;
create trigger trg_tarefas_historico after insert or update on tarefas
  for each row execute function registrar_historico_tarefa();

-- ----------------------------------------------------------------------------
-- 3. abrir_tarefa(): criação idempotente (usada pela IA, automações e rotinas)
-- ----------------------------------------------------------------------------
-- Entrada (jsonb): titulo, descricao, categoria, prioridade, origem, cliente_id,
-- pedido_id, conversa_id, prazo, sugestao_ia, chave_dedup, contexto, ator.
-- Saída: { id, numero, criada } — criada=false quando já existia tarefa aberta
-- com a mesma chave_dedup (nada é duplicado).
create or replace function abrir_tarefa(p jsonb)
returns jsonb as $$
declare
  v_id uuid;
  v_numero bigint;
  v_chave text := nullif(trim(p->>'chave_dedup'), '');
begin
  if coalesce(trim(p->>'titulo'), '') = '' then
    raise exception 'abrir_tarefa: titulo é obrigatório';
  end if;

  perform set_config('app.ator', coalesce(nullif(p->>'ator', ''), 'sistema'), true);

  insert into tarefas (titulo, descricao, categoria, prioridade, origem, cliente_id, pedido_id,
                       conversa_id, prazo, sugestao_ia, chave_dedup, contexto)
  values (
    left(trim(p->>'titulo'), 200),
    left(nullif(p->>'descricao', ''), 4000),
    coalesce(nullif(p->>'categoria', ''), 'outro'),
    coalesce(nullif(p->>'prioridade', ''), 'media'),
    coalesce(nullif(p->>'origem', ''), 'sistema'),
    nullif(p->>'cliente_id', '')::uuid,
    nullif(p->>'pedido_id', '')::uuid,
    nullif(p->>'conversa_id', '')::uuid,
    nullif(p->>'prazo', '')::timestamptz,
    left(nullif(p->>'sugestao_ia', ''), 2000),
    v_chave,
    p->'contexto'
  )
  on conflict (chave_dedup) where chave_dedup is not null and status not in ('CONCLUIDA', 'CANCELADA')
  do nothing
  returning id, numero into v_id, v_numero;

  if v_id is not null then
    return jsonb_build_object('id', v_id, 'numero', v_numero, 'criada', true);
  end if;

  select id, numero into v_id, v_numero
  from tarefas
  where chave_dedup = v_chave and status not in ('CONCLUIDA', 'CANCELADA')
  limit 1;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'criada', false);
end;
$$ language plpgsql security definer set search_path = public;

-- Conclui sozinha a tarefa aberta de um problema que deixou de existir.
create or replace function concluir_tarefa_automaticamente(p_chave text, p_motivo text)
returns integer as $$
declare
  v_qtd integer;
begin
  perform set_config('app.ator', 'automacao', true);
  update tarefas
  set status = 'CONCLUIDA',
      observacoes = trim(both E'\n' from coalesce(observacoes, '') || E'\n' || '✔ Resolvida automaticamente: ' || p_motivo)
  where chave_dedup = p_chave and status not in ('CONCLUIDA', 'CANCELADA');
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$ language plpgsql security definer set search_path = public;

-- Só o servidor (service role) e as funções internas chamam essas duas.
revoke execute on function abrir_tarefa(jsonb) from public, anon, authenticated;
grant execute on function abrir_tarefa(jsonb) to service_role;
revoke execute on function concluir_tarefa_automaticamente(text, text) from public, anon, authenticated;
grant execute on function concluir_tarefa_automaticamente(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Automação: pedido atrasado
-- ----------------------------------------------------------------------------
-- Limite configurável em Configurações (chave pedido_atraso_minutos, padrão
-- 90). Só olha pedidos dos últimos 2 dias: pedidos muito antigos que ficaram
-- esquecidos em "novo" não viram uma enxurrada de tarefas no primeiro dia.
insert into configuracoes (chave, valor, tipo) values ('pedido_atraso_minutos', '90', 'number')
on conflict (chave) do nothing;

create or replace function verificar_pedidos_atrasados()
returns jsonb as $$
declare
  v_limite integer;
  v_pedido record;
  v_res jsonb;
  v_criadas integer := 0;
begin
  select coalesce(nullif(valor, '')::integer, 90) into v_limite
  from configuracoes where chave = 'pedido_atraso_minutos';
  v_limite := coalesce(v_limite, 90);

  for v_pedido in
    select p.id, p.status, p.criado_em, p.cliente_id, c.nome as cliente_nome
    from pedidos p
    join clientes c on c.id = p.cliente_id
    where p.status in ('novo', 'separando')
      and p.criado_em < now() - make_interval(mins => v_limite)
      and p.criado_em > now() - interval '2 days'
  loop
    v_res := abrir_tarefa(jsonb_build_object(
      'titulo', 'Pedido parado em "' || case v_pedido.status when 'novo' then 'pronto pra separar' else 'separando' end
                || '" há mais de ' || v_limite || ' min',
      'descricao', 'Pedido de ' || v_pedido.cliente_nome || ' criado em '
                   || to_char(v_pedido.criado_em at time zone 'America/Bahia', 'DD/MM HH24:MI')
                   || ' ainda não avançou no quadro de Pedidos.',
      'categoria', 'pedido_atrasado',
      'prioridade', 'alta',
      'origem', 'automacao',
      'cliente_id', v_pedido.cliente_id,
      'pedido_id', v_pedido.id,
      'sugestao_ia', 'Confira se o pedido já foi separado e mova o cartão no quadro. Se houver falta de produto, avise o cliente antes de qualquer alteração.',
      'chave_dedup', 'pedido_atrasado:' || v_pedido.id,
      'ator', 'automacao'
    ));
    if (v_res->>'criada')::boolean then
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  return jsonb_build_object('tarefas_criadas', v_criadas, 'limite_minutos', v_limite);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function verificar_pedidos_atrasados() from public, anon, authenticated;
grant execute on function verificar_pedidos_atrasados() to service_role;

-- Pedido andou (pronto/entregue) → a tarefa de atraso fecha sozinha.
-- Pagamento confirmado → a tarefa de pagamento pendente fecha sozinha.
create or replace function pedidos_resolver_tarefas()
returns trigger as $$
begin
  if new.status is distinct from old.status and new.status in ('pronto', 'entregue') then
    perform concluir_tarefa_automaticamente('pedido_atrasado:' || new.id, 'o pedido foi movido para "' || new.status || '".');
  end if;
  if new.pagamento_status is distinct from old.pagamento_status and new.pagamento_status = 'confirmado' then
    perform concluir_tarefa_automaticamente('pagamento_pendente:' || new.id, 'o pagamento foi confirmado no sistema.');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_pedidos_resolver_tarefas on pedidos;
create trigger trg_pedidos_resolver_tarefas after update on pedidos
  for each row execute function pedidos_resolver_tarefas();

-- ----------------------------------------------------------------------------
-- 5. RLS — qualquer usuária ativa trabalha as tarefas; só a dona exclui.
-- ----------------------------------------------------------------------------
alter table tarefas enable row level security;
alter table tarefa_historico enable row level security;

drop policy if exists tarefas_select on tarefas;
create policy tarefas_select on tarefas for select using (is_usuario_ativo());
drop policy if exists tarefas_insert on tarefas;
create policy tarefas_insert on tarefas for insert with check (is_usuario_ativo());
drop policy if exists tarefas_update on tarefas;
create policy tarefas_update on tarefas for update using (is_usuario_ativo());
drop policy if exists tarefas_delete on tarefas;
create policy tarefas_delete on tarefas for delete using (is_dona());

-- Histórico: só leitura pelo painel (quem escreve é o trigger).
drop policy if exists tarefa_historico_select on tarefa_historico;
create policy tarefa_historico_select on tarefa_historico for select using (is_usuario_ativo());

-- Tempo real: o quadro de tarefas atualiza sozinho.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tarefas') then
    alter publication supabase_realtime add table tarefas;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Agendamento (pg_cron, dentro do próprio banco: sobrevive a reinício do
--    servidor do CRM e do N8N). Se a extensão não existir, só avisa.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'verificar-pedidos-atrasados';
    perform cron.schedule('verificar-pedidos-atrasados', '*/15 * * * *',
                          'select public.verificar_pedidos_atrasados()');
  else
    raise notice 'pg_cron não está disponível neste banco: ative em Database → Extensions → pg_cron e rode esta migração de novo para agendar a verificação de pedidos atrasados.';
  end if;
end $$;
