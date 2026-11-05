-- ============================================================================
-- IA travando sem motivo: máquina de estados + recuperação diária às 22h
--
-- CAUSA RAIZ (ver docs/diagnostico-ia-travando.md):
-- `conversas.status = 'aguardando_humano'` era uma trava SEM PRAZO, gravada
-- sozinha por várias rotas (resposta pelo Chat ao vivo, áudio, nova conversa,
-- transferência da IA, mesclagem) e pelo botão "Travar". Nada voltava ela pra
-- "aberta" — o webhook de mensagens até preservava a trava de propósito. Ao
-- mesmo tempo, o N8N avisa no chat "IA pausada por 10 min... Volta sozinha".
-- Resultado: a IA ficava desligada pra sempre naquela conversa, e ninguém
-- sabia por quê (não havia registro do motivo).
--
-- O QUE ESTA MIGRAÇÃO FAZ (só ADICIONA; nada é removido):
-- 1. Novas colunas em `conversas`: ia_pausada_ate (prazo da pausa), ia_motivo,
--    ia_motivo_em, ia_ator e ia_evento_id. `status` continua existindo e com
--    o mesmo significado pro N8N e pra tela.
-- 2. `mensagens.externo_id` (id da mensagem no WhatsApp) com índice único
--    parcial: o mesmo evento do webhook não é gravado duas vezes.
-- 3. `conversa_eventos_ia`: toda mudança de estado da IA fica registrada
--    (conversa, estado anterior, estado novo, motivo, ator, evento, quando).
-- 4. Triggers que dão motivo a toda mudança (inclusive as feitas direto pela
--    tela) e impedem que uma pausa de 10 min encurte uma trava manual.
-- 5. `deve_ia_responder()` reescrita: mesma assinatura e mesmo uso pelo N8N,
--    agora entende pausa vencida (libera sozinha) e acha o cliente mesmo com
--    o telefone escrito com/sem 55 e com/sem o 9º dígito.
-- 6. `recuperar_atendimentos_ia()`: rotina das 22h (America/Bahia). Reativa
--    a IA nas conversas pausadas/transferidas/travadas sem motivo, NUNCA
--    mexe em número bloqueado (clientes.ia_bloqueada) nem em conversa travada
--    de propósito pelo botão (ia_motivo = 'manual'). Não envia mensagem.
--    Idempotente (1 execução agendada por dia) e com trava de concorrência.
-- 7. Agenda a rotina no pg_cron às 22:00 e 22:30 de Salvador (01:00 e 01:30
--    UTC; a Bahia não tem horário de verão). A das 22:30 só age se a das 22:00
--    não tiver concluído.
--
-- DADOS EXISTENTES TOCADOS (só colunas novas):
-- - Conversas que hoje estão em 'aguardando_humano' recebem ia_motivo='legado'
--   (o motivo original não foi registrado na época). Elas CONTINUAM travadas
--   até a primeira execução da rotina das 22h, que as reativa. Se alguma delas
--   foi travada de propósito, clique em "Destravar" e "Travar" de novo antes
--   das 22h: isso grava o motivo 'manual' e a rotina passa a respeitar.
-- - Nenhuma linha muda de posição na lista do Chat ao vivo.
--
-- Pode rodar mais de uma vez sem erro. Rodar no SQL editor do Supabase DEPOIS
-- de 20261105_central_tarefas.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas
-- ----------------------------------------------------------------------------
alter table conversas add column if not exists ia_pausada_ate timestamptz;
alter table conversas add column if not exists ia_motivo text;
alter table conversas add column if not exists ia_motivo_em timestamptz;
alter table conversas add column if not exists ia_ator text;
alter table conversas add column if not exists ia_evento_id text;

comment on column conversas.ia_pausada_ate is
  'Com status=aguardando_humano: até quando a IA fica pausada. NULL = trava sem prazo (manual, transferência). Depois do prazo, deve_ia_responder() libera sozinha.';
comment on column conversas.ia_motivo is
  'Por que a IA está no estado atual (manual, resposta_crm, transferencia_ia, legado, recuperacao_22h...). Gravado em toda mudança.';
comment on column conversas.ia_ator is
  'Quem causou a última mudança de estado da IA: usuario:<uuid>, ia, n8n, sistema, cron.';
comment on column conversas.ia_evento_id is
  'Id do evento que causou a última mudança (ex.: id da mensagem ou da execução da rotina).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversas_ia_motivo_check') then
    alter table conversas add constraint conversas_ia_motivo_check check (ia_motivo is null or ia_motivo in (
      -- motivos de trava/pausa
      'manual', 'resposta_crm', 'transferencia_ia', 'nova_conversa_crm', 'mesclagem', 'legado', 'nao_informado',
      -- motivos de liberação
      'destravada_manual', 'pausa_expirada', 'recuperacao_22h', 'recuperacao_manual', 'cliente_reabriu',
      -- genéricos
      'webhook', 'encerrada'
    ));
  end if;
end $$;

-- Mesma mensagem do WhatsApp nunca vira duas linhas (webhook repetido).
alter table mensagens add column if not exists externo_id text;
create unique index if not exists idx_mensagens_externo_id on mensagens (externo_id) where externo_id is not null;
comment on column mensagens.externo_id is
  'Id da mensagem no WhatsApp/uazapi (messageid). Único: o mesmo evento repetido pelo webhook é ignorado.';

create index if not exists idx_conversas_aguardando on conversas (status, ia_pausada_ate) where status = 'aguardando_humano';

-- Minutos que a IA fica pausada quando alguém da equipe responde pelo Chat ao
-- vivo (renova a cada resposta). 10 = o mesmo tempo que o N8N já usa e avisa.
insert into configuracoes (chave, valor, tipo) values ('ia_pausa_resposta_humana_minutos', '10', 'number')
on conflict (chave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Ordem da lista: mudar só o estado da IA não "sobe" a conversa
-- ----------------------------------------------------------------------------
-- Mesma função de 20261024_chat_previa_ultima_mensagem.sql, com status e as
-- colunas ia_* na lista de exceções. Sem isso, a rotina das 22h reativando
-- 200 conversas embaralharia a lista do Chat ao vivo. Rotas que querem subir
-- a conversa (mensagem nova) continuam mandando atualizado_em explícito.
create or replace function set_atualizado_em_conversas()
returns trigger as $$
declare
  v_ignorar text[] := array['nao_lidas', 'classificacao', 'ultima_mensagem', 'ultima_mensagem_em',
                            'ultima_mensagem_remetente', 'ultima_mensagem_tipo', 'status', 'ia_pausada_ate',
                            'ia_motivo', 'ia_motivo_em', 'ia_ator', 'ia_evento_id'];
begin
  if to_jsonb(new) is distinct from to_jsonb(old)
     and (to_jsonb(new) - v_ignorar) = (to_jsonb(old) - v_ignorar) then
    new.atualizado_em = old.atualizado_em;
  else
    new.atualizado_em = now();
  end if;
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- 3. Dados existentes: trava sem motivo conhecido = 'legado'
-- ----------------------------------------------------------------------------
-- Vem ANTES dos triggers de estado (não gera evento falso) e DEPOIS do ajuste
-- acima (não mexe na ordem da lista).
update conversas
set ia_motivo = 'legado', ia_motivo_em = now(), ia_ator = 'migracao'
where status = 'aguardando_humano' and ia_motivo is null;

-- ----------------------------------------------------------------------------
-- 4. Estado conceitual da IA (o mesmo cálculo de src/lib/ia/estado.ts)
-- ----------------------------------------------------------------------------
--   BLOQUEADA         número bloqueado pela equipe (clientes.ia_bloqueada)
--   ENCERRADA         conversa fechada (reabre na próxima mensagem do cliente)
--   PAUSA_TEMPORARIA  aguardando_humano com prazo no futuro
--   HUMANO_ASSUMIU    aguardando_humano sem prazo (manual/transferência)
--   IA_ATIVA          aberta, ou pausa cujo prazo já venceu
create or replace function estado_ia(p_status text, p_pausada_ate timestamptz, p_bloqueado boolean)
returns text as $$
  select case
    when coalesce(p_bloqueado, false) then 'BLOQUEADA'
    when p_status = 'fechada' then 'ENCERRADA'
    when p_status = 'aguardando_humano' and p_pausada_ate is null then 'HUMANO_ASSUMIU'
    when p_status = 'aguardando_humano' and p_pausada_ate > now() then 'PAUSA_TEMPORARIA'
    else 'IA_ATIVA'
  end;
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- 5. Eventos de estado
-- ----------------------------------------------------------------------------
create table if not exists conversa_eventos_ia (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id) on delete cascade,
  estado_anterior text,
  estado_novo text not null,
  status_anterior text,
  status_novo text,
  motivo text,
  ator text,
  evento_id text,
  pausada_ate timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_conversa_eventos_ia_conversa on conversa_eventos_ia (conversa_id, criado_em desc);
create index if not exists idx_conversa_eventos_ia_criado_em on conversa_eventos_ia (criado_em desc);

alter table conversa_eventos_ia enable row level security;
drop policy if exists conversa_eventos_ia_select on conversa_eventos_ia;
create policy conversa_eventos_ia_select on conversa_eventos_ia for select using (is_usuario_ativo());
-- Sem policy de insert/update/delete: só o trigger (security definer) grava.

-- Motivos que representam uma decisão de pessoa/IA de deixar a conversa com
-- humano SEM prazo. Uma resposta pelo chat (pausa de N minutos) não encurta.
create or replace function ia_motivo_sem_prazo(p_motivo text)
returns boolean as $$
  select coalesce(p_motivo in ('manual', 'transferencia_ia', 'nova_conversa_crm'), false);
$$ language sql immutable;

-- BEFORE UPDATE: toda mudança de estado ganha motivo, data e ator.
create or replace function normalizar_estado_ia_conversa()
returns trigger as $$
begin
  if new.status is not distinct from old.status
     and new.ia_pausada_ate is not distinct from old.ia_pausada_ate
     and new.ia_motivo is not distinct from old.ia_motivo then
    return new;
  end if;

  -- Pausa por tempo (resposta pelo chat) não encurta trava sem prazo.
  if old.status = 'aguardando_humano' and old.ia_pausada_ate is null and ia_motivo_sem_prazo(old.ia_motivo)
     and new.status = 'aguardando_humano' and new.ia_pausada_ate is not null then
    new.ia_pausada_ate := null;
    new.ia_motivo := old.ia_motivo;
    new.ia_ator := old.ia_ator;
    new.ia_evento_id := old.ia_evento_id;
    new.ia_motivo_em := old.ia_motivo_em;
    return new;
  end if;

  -- Quem mudou o status sem informar motivo (ex.: tela antiga, outra rota):
  -- o banco deduz um, pra nunca existir mudança sem explicação.
  if new.status is distinct from old.status and new.ia_motivo is not distinct from old.ia_motivo then
    new.ia_motivo := case
      when new.status = 'aguardando_humano' then case when auth.uid() is not null then 'manual' else 'nao_informado' end
      when new.status = 'fechada' then 'encerrada'
      else case when auth.uid() is not null then 'destravada_manual' else 'nao_informado' end
    end;
    if new.status = 'aguardando_humano' and new.ia_pausada_ate is not distinct from old.ia_pausada_ate then
      new.ia_pausada_ate := null;
    end if;
    if new.ia_ator is not distinct from old.ia_ator then
      new.ia_ator := coalesce('usuario:' || auth.uid()::text, 'sistema');
    end if;
  end if;

  if new.status <> 'aguardando_humano' then
    new.ia_pausada_ate := null;
  end if;
  new.ia_motivo_em := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_conversas_normalizar_estado_ia on conversas;
create trigger trg_conversas_normalizar_estado_ia before update on conversas
  for each row execute function normalizar_estado_ia_conversa();

-- AFTER INSERT/UPDATE: grava o evento de mudança.
create or replace function registrar_evento_ia_conversa()
returns trigger as $$
declare
  v_bloqueado boolean;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.ia_pausada_ate is not distinct from old.ia_pausada_ate
     and new.ia_motivo is not distinct from old.ia_motivo then
    return new;
  end if;
  -- Conversa nova "aberta" é o normal; só registra se já nasce travada.
  if tg_op = 'INSERT' and new.status = 'aberta' then
    return new;
  end if;

  select ia_bloqueada into v_bloqueado from clientes where id = new.cliente_id;

  insert into conversa_eventos_ia (conversa_id, estado_anterior, estado_novo, status_anterior, status_novo,
                                   motivo, ator, evento_id, pausada_ate)
  values (
    new.id,
    case when tg_op = 'UPDATE' then estado_ia(old.status, old.ia_pausada_ate, v_bloqueado) end,
    estado_ia(new.status, new.ia_pausada_ate, v_bloqueado),
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    coalesce(new.ia_motivo, 'nao_informado'),
    coalesce(new.ia_ator, 'sistema'),
    new.ia_evento_id,
    new.ia_pausada_ate
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_conversas_evento_ia on conversas;
create trigger trg_conversas_evento_ia after insert or update on conversas
  for each row execute function registrar_evento_ia_conversa();

-- Bloqueio/desbloqueio do número também vira evento (na conversa mais recente).
create or replace function registrar_evento_bloqueio_cliente()
returns trigger as $$
declare
  v_conversa record;
begin
  if new.ia_bloqueada is not distinct from old.ia_bloqueada then
    return new;
  end if;
  select id, status, ia_pausada_ate into v_conversa
  from conversas where cliente_id = new.id order by criado_em desc limit 1;
  if v_conversa.id is null then
    return new;
  end if;
  insert into conversa_eventos_ia (conversa_id, estado_anterior, estado_novo, status_anterior, status_novo, motivo, ator)
  values (
    v_conversa.id,
    estado_ia(v_conversa.status, v_conversa.ia_pausada_ate, old.ia_bloqueada),
    estado_ia(v_conversa.status, v_conversa.ia_pausada_ate, new.ia_bloqueada),
    v_conversa.status, v_conversa.status,
    case when new.ia_bloqueada then 'numero_bloqueado' else 'numero_desbloqueado' end,
    coalesce('usuario:' || auth.uid()::text, 'sistema')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_clientes_evento_bloqueio on clientes;
create trigger trg_clientes_evento_bloqueio after update of ia_bloqueada on clientes
  for each row execute function registrar_evento_bloqueio_cliente();

-- ----------------------------------------------------------------------------
-- 6. Telefone: variações brasileiras (55 / 9º dígito)
-- ----------------------------------------------------------------------------
-- O WhatsApp entrega números antigos SEM o 9º dígito ("557199654233"), e a
-- equipe digita COM ("5571999654233"). Sem isto, o bloqueio gravado num
-- cadastro não valia pro outro.
create or replace function variantes_telefone_br(p_digitos text)
returns text[] as $$
declare
  d text := regexp_replace(coalesce(p_digitos, ''), '[^0-9]', '', 'g');
  nacional text;
  v text[] := array[]::text[];
begin
  if d = '' then
    return v;
  end if;
  v := array[d];
  nacional := case when length(d) in (12, 13) and left(d, 2) = '55' then substr(d, 3) else d end;
  if length(nacional) not in (10, 11) then
    return v;
  end if;
  v := v || nacional || ('55' || nacional);
  if length(nacional) = 11 and substr(nacional, 3, 1) = '9' then
    v := v || (left(nacional, 2) || substr(nacional, 4)) || ('55' || left(nacional, 2) || substr(nacional, 4));
  elsif length(nacional) = 10 and substr(nacional, 3, 1) in ('6', '7', '8', '9') then
    v := v || (left(nacional, 2) || '9' || substr(nacional, 3)) || ('55' || left(nacional, 2) || '9' || substr(nacional, 3));
  end if;
  return array(select distinct unnest(v));
end;
$$ language plpgsql immutable;

-- ----------------------------------------------------------------------------
-- 7. deve_ia_responder() — mesma assinatura usada pelo N8N
-- ----------------------------------------------------------------------------
-- true  = a IA pode responder
-- false = número bloqueado, ou conversa com humano (pausa vigente ou trava)
-- Pausa vencida é liberada aqui mesmo (por isso deixou de ser `stable`): a
-- IA volta na primeira mensagem depois do prazo, sem depender da rotina.
create or replace function deve_ia_responder(telefone_busca text)
returns boolean as $$
declare
  v_digitos text := regexp_replace(coalesce(telefone_busca, ''), '[^0-9]', '', 'g');
  v_cliente record;
  v_conversa record;
begin
  select id, ia_bloqueada into v_cliente from clientes where telefone = v_digitos limit 1;

  if v_cliente.id is null then
    select id, ia_bloqueada into v_cliente
    from clientes
    where telefone = any (variantes_telefone_br(v_digitos))
    order by ia_bloqueada desc, ultima_interacao desc nulls last
    limit 1;
  end if;

  if v_cliente.id is null then
    return true;  -- primeira mensagem de um número novo
  end if;

  if v_cliente.ia_bloqueada then
    return false;
  end if;

  select id, status, ia_pausada_ate into v_conversa
  from conversas where cliente_id = v_cliente.id
  order by criado_em desc limit 1;

  if v_conversa.id is null or v_conversa.status <> 'aguardando_humano' then
    return true;
  end if;

  if v_conversa.ia_pausada_ate is not null and v_conversa.ia_pausada_ate <= now() then
    update conversas
    set status = 'aberta', ia_motivo = 'pausa_expirada', ia_ator = 'sistema', ia_evento_id = null
    where id = v_conversa.id and status = 'aguardando_humano'
      and ia_pausada_ate is not null and ia_pausada_ate <= now();
    return true;
  end if;

  return false;
end;
$$ language plpgsql volatile;

-- ----------------------------------------------------------------------------
-- 8. Execuções de rotinas (histórico + idempotência)
-- ----------------------------------------------------------------------------
create table if not exists rotinas_execucoes (
  id uuid primary key default gen_random_uuid(),
  rotina text not null,
  origem text not null check (origem in ('agendada', 'manual')),
  -- Dia (em Salvador) a que a execução se refere — é o que impede rodar 2x.
  data_referencia date not null,
  status text not null default 'executando' check (status in ('executando', 'concluida', 'falhou')),
  ator text,
  resultado jsonb,
  erro text,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz
);

-- Uma execução agendada por rotina por dia (a falha libera nova tentativa).
create unique index if not exists idx_rotinas_execucoes_agendada_dia on rotinas_execucoes (rotina, data_referencia)
  where origem = 'agendada' and status in ('executando', 'concluida');
create index if not exists idx_rotinas_execucoes_iniciada on rotinas_execucoes (rotina, iniciada_em desc);

alter table rotinas_execucoes enable row level security;
drop policy if exists rotinas_execucoes_select on rotinas_execucoes;
create policy rotinas_execucoes_select on rotinas_execucoes for select using (is_dona());

-- ----------------------------------------------------------------------------
-- 9. Rotina de recuperação (22h)
-- ----------------------------------------------------------------------------
-- p_origem:  'agendada' (pg_cron/N8N, 1x por dia) ou 'manual' (painel)
-- p_simular: true = só conta o que faria, não muda nada
-- p_ator:    quem pediu (cron, n8n, usuario:<uuid>)
create or replace function recuperar_atendimentos_ia(
  p_origem text default 'agendada',
  p_simular boolean default false,
  p_ator text default 'sistema'
)
returns jsonb as $$
declare
  v_data date := (now() at time zone 'America/Bahia')::date;
  v_exec uuid;
  v_elegiveis integer;
  v_bloqueadas integer;
  v_manuais integer;
  v_reativadas integer := 0;
  v_por_motivo jsonb;
  v_resultado jsonb;
begin
  if p_origem not in ('agendada', 'manual') then
    raise exception 'recuperar_atendimentos_ia: origem inválida (%)', p_origem;
  end if;

  -- Duas execuções ao mesmo tempo (cron + botão) esperam uma pela outra.
  perform pg_advisory_xact_lock(hashtext('recuperar_atendimentos_ia'));

  select
    count(*) filter (where not cl.ia_bloqueada and coalesce(c.ia_motivo, 'legado') <> 'manual'),
    count(*) filter (where cl.ia_bloqueada),
    count(*) filter (where not cl.ia_bloqueada and c.ia_motivo = 'manual')
  into v_elegiveis, v_bloqueadas, v_manuais
  from conversas c
  join clientes cl on cl.id = c.cliente_id
  where c.status = 'aguardando_humano';

  select coalesce(jsonb_object_agg(motivo, qtd), '{}'::jsonb) into v_por_motivo
  from (
    select coalesce(c.ia_motivo, 'legado') as motivo, count(*) as qtd
    from conversas c join clientes cl on cl.id = c.cliente_id
    where c.status = 'aguardando_humano' and not cl.ia_bloqueada and coalesce(c.ia_motivo, 'legado') <> 'manual'
    group by 1
  ) m;

  if p_simular then
    return jsonb_build_object(
      'simulacao', true, 'data_referencia', v_data,
      'seriam_reativadas', v_elegiveis, 'por_motivo', v_por_motivo,
      'preservadas_numero_bloqueado', v_bloqueadas, 'preservadas_trava_manual', v_manuais
    );
  end if;

  if p_origem = 'agendada' and exists (
    select 1 from rotinas_execucoes
    where rotina = 'recuperacao_ia_22h' and origem = 'agendada' and data_referencia = v_data
      and status in ('executando', 'concluida')
  ) then
    return jsonb_build_object('ja_executada', true, 'data_referencia', v_data);
  end if;

  insert into rotinas_execucoes (rotina, origem, data_referencia, status, ator)
  values ('recuperacao_ia_22h', p_origem, v_data, 'executando', p_ator)
  returning id into v_exec;

  begin
    with alvo as (
      update conversas c
      set status = 'aberta',
          ia_pausada_ate = null,
          ia_motivo = case when p_origem = 'agendada' then 'recuperacao_22h' else 'recuperacao_manual' end,
          ia_ator = p_ator,
          ia_evento_id = 'rotina:' || v_exec
      from clientes cl
      where cl.id = c.cliente_id
        and c.status = 'aguardando_humano'
        and not cl.ia_bloqueada
        and coalesce(c.ia_motivo, 'legado') <> 'manual'
      returning c.id
    )
    select count(*) into v_reativadas from alvo;

    v_resultado := jsonb_build_object(
      'execucao_id', v_exec, 'data_referencia', v_data,
      'reativadas', v_reativadas, 'por_motivo', v_por_motivo,
      'preservadas_numero_bloqueado', v_bloqueadas, 'preservadas_trava_manual', v_manuais,
      'falhas', 0
    );

    update rotinas_execucoes
    set status = 'concluida', finalizada_em = now(), resultado = v_resultado
    where id = v_exec;
  exception when others then
    -- O UPDATE acima é uma instrução só: ou reativa todas, ou nenhuma (nada
    -- fica pela metade). A falha fica registrada e vira tarefa técnica.
    update rotinas_execucoes
    set status = 'falhou', finalizada_em = now(), erro = left(sqlerrm, 1000),
        resultado = jsonb_build_object('falhas', 1, 'data_referencia', v_data)
    where id = v_exec;

    perform abrir_tarefa(jsonb_build_object(
      'titulo', 'Rotina das 22h (reativação da IA) falhou',
      'descricao', 'A recuperação automática das conversas não concluiu. Nenhuma conversa foi alterada nesta tentativa. A rotina tenta de novo às 22:30; também dá pra rodar pelo painel Operações.',
      'categoria', 'erro_integracao',
      'prioridade', 'alta',
      'origem', 'sistema',
      'sugestao_ia', 'Abra Operações → Rotina das 22h e rode a verificação manual. Se repetir, envie o erro registrado ao suporte técnico.',
      'chave_dedup', 'rotina_falhou:recuperacao_ia_22h',
      'contexto', jsonb_build_object('execucao_id', v_exec, 'erro', left(sqlerrm, 500)),
      'ator', 'sistema'
    ));

    return jsonb_build_object('execucao_id', v_exec, 'erro', left(sqlerrm, 500), 'falhas', 1);
  end;

  return v_resultado;
end;
$$ language plpgsql security definer set search_path = public;

-- Só o servidor (service role) chama; o painel passa pela rota da dona.
revoke execute on function recuperar_atendimentos_ia(text, boolean, text) from public, anon, authenticated;
grant execute on function recuperar_atendimentos_ia(text, boolean, text) to service_role;

-- ----------------------------------------------------------------------------
-- 10. Indicadores pro painel Operações (uma consulta só)
-- ----------------------------------------------------------------------------
create or replace function painel_operacoes_ia()
returns jsonb as $$
  with ult as (
    select c.status, c.ia_pausada_ate, c.ia_motivo, cl.ia_bloqueada,
           c.ultima_mensagem_remetente, c.ultima_mensagem_em
    from (
      select distinct on (cliente_id) *
      from conversas
      order by cliente_id, criado_em desc
    ) c
    join clientes cl on cl.id = c.cliente_id
  )
  select jsonb_build_object(
    'ativas', count(*) filter (where estado_ia(status, ia_pausada_ate, ia_bloqueada) = 'IA_ATIVA'),
    'pausadas', count(*) filter (where estado_ia(status, ia_pausada_ate, ia_bloqueada) = 'PAUSA_TEMPORARIA'),
    'com_humano', count(*) filter (where estado_ia(status, ia_pausada_ate, ia_bloqueada) = 'HUMANO_ASSUMIU'),
    'com_humano_manual', count(*) filter (where estado_ia(status, ia_pausada_ate, ia_bloqueada) = 'HUMANO_ASSUMIU' and ia_motivo = 'manual'),
    'bloqueadas', count(*) filter (where ia_bloqueada),
    -- IA ativa, mas o cliente falou por último há mais de 15 min e ninguém
    -- respondeu: forte sinal de falha no fluxo (erro no N8N, IA fora do ar).
    'sem_resposta', count(*) filter (
      where estado_ia(status, ia_pausada_ate, ia_bloqueada) = 'IA_ATIVA'
        and ultima_mensagem_remetente = 'cliente'
        and ultima_mensagem_em < now() - interval '15 minutes'
        and ultima_mensagem_em > now() - interval '24 hours'
    ),
    'gerado_em', now()
  )
  from ult;
$$ language sql stable security definer set search_path = public;

-- Só o servidor (service role) chama, depois de conferir que é a dona.
revoke execute on function painel_operacoes_ia() from public, anon, authenticated;
grant execute on function painel_operacoes_ia() to service_role;

-- ----------------------------------------------------------------------------
-- 11. Agendamento às 22:00 e 22:30 de Salvador (pg_cron, em UTC)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'recuperacao-ia-22h';
    -- 01:00 e 01:30 UTC = 22:00 e 22:30 em America/Bahia (UTC-3 fixo).
    perform cron.schedule('recuperacao-ia-22h', '0,30 1 * * *',
                          'select public.recuperar_atendimentos_ia(''agendada'', false, ''cron'')');
  else
    raise notice 'pg_cron não está disponível neste banco: ative em Database → Extensions → pg_cron e rode esta migração de novo, OU agende no N8N um POST diário às 22:00 para /api/automacoes/recuperacao-ia (ver docs/n8n-ajustes.md).';
  end if;
end $$;
