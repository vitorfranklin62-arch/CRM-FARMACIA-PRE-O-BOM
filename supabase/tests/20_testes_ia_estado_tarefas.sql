-- Testes das migrações 20261105_* (máquina de estados da IA, rotina 22h,
-- Central de Tarefas, mensagens automáticas). Cada bloco falha com
-- "FALHOU: ..." se alguma regra for quebrada. Roda via supabase/tests/rodar.sh.
\set ON_ERROR_STOP 1

create or replace function pg_temp.checar(p_ok boolean, p_msg text) returns void as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$ language plpgsql;

-- Atalhos de id
\set ana '\'20000000-0000-0000-0000-000000000001\''
\set bruno '\'20000000-0000-0000-0000-000000000002\''
\set carla '\'20000000-0000-0000-0000-000000000003\''

-- ---------------------------------------------------------------------------
-- 1. Migração: trava antiga ganha motivo 'legado' sem reordenar a lista
-- ---------------------------------------------------------------------------
select pg_temp.checar((select ia_motivo = 'legado' from conversas where id = :ana), 'trava antiga marcada como legado');
select pg_temp.checar((select atualizado_em = '2026-01-01T10:00:00Z' from conversas where id = :ana), 'migração não mexe na ordem da lista (atualizado_em)');
select pg_temp.checar((select ia_motivo is null from conversas where id = :bruno), 'conversa aberta não é tocada pela migração');
select pg_temp.checar((select count(*) = 0 from conversa_eventos_ia), 'migração não gera eventos falsos');

-- ---------------------------------------------------------------------------
-- 2. deve_ia_responder
-- ---------------------------------------------------------------------------
select pg_temp.checar(deve_ia_responder('+55 71 0000-9999') = true, 'número desconhecido → IA responde');
select pg_temp.checar(deve_ia_responder('557100000002') = true, 'conversa aberta → IA responde');
select pg_temp.checar(deve_ia_responder('557100000001') = false, 'trava legado ainda vale antes das 22h');
-- Carla está salva COM o 9º dígito e bloqueada; o WhatsApp manda SEM.
select pg_temp.checar(deve_ia_responder('+55 71 9965-4233') = false, 'número bloqueado é achado mesmo sem o 9º dígito');
select pg_temp.checar(deve_ia_responder('71999654233') = false, 'número bloqueado é achado sem o 55');

-- Pausa por tempo vigente e vencida
update conversas set status = 'aguardando_humano', ia_pausada_ate = now() + interval '10 minutes',
       ia_motivo = 'resposta_crm', ia_ator = 'usuario:teste' where id = :bruno;
select pg_temp.checar(deve_ia_responder('557100000002') = false, 'pausa de 10 min vigente → IA não responde');
select pg_temp.checar((select estado_novo = 'PAUSA_TEMPORARIA' and estado_anterior = 'IA_ATIVA' and motivo = 'resposta_crm'
                         from conversa_eventos_ia where conversa_id = :bruno order by criado_em desc limit 1),
                      'evento registra IA_ATIVA → PAUSA_TEMPORARIA com motivo');
update conversas set ia_pausada_ate = now() - interval '1 second' where id = :bruno;
select pg_temp.checar(deve_ia_responder('557100000002') = true, 'pausa vencida → IA volta a responder');
select pg_temp.checar((select status = 'aberta' and ia_motivo = 'pausa_expirada' and ia_pausada_ate is null from conversas where id = :bruno),
                      'pausa vencida é liberada no banco com motivo pausa_expirada');

-- ---------------------------------------------------------------------------
-- 3. Regras de transição
-- ---------------------------------------------------------------------------
-- Trava manual (botão) não é encurtada por uma resposta pelo chat.
update conversas set status = 'aguardando_humano', ia_motivo = 'manual', ia_pausada_ate = null, ia_ator = 'usuario:x' where id = :bruno;
update conversas set status = 'aguardando_humano', ia_motivo = 'resposta_crm', ia_pausada_ate = now() + interval '10 minutes' where id = :bruno;
select pg_temp.checar((select ia_motivo = 'manual' and ia_pausada_ate is null from conversas where id = :bruno),
                      'resposta pelo chat não transforma trava manual em pausa de 10 min');

-- Mudança de status sem motivo: service role → nao_informado; usuária logada → manual.
update conversas set status = 'aberta' where id = :bruno;
select pg_temp.checar((select ia_motivo = 'nao_informado' and ia_ator = 'sistema' from conversas where id = :bruno),
                      'mudança sem motivo pelo servidor vira nao_informado');
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
update conversas set status = 'aguardando_humano' where id = :bruno;
select pg_temp.checar((select ia_motivo = 'manual' and ia_ator like 'usuario:%' and ia_pausada_ate is null from conversas where id = :bruno),
                      'botão Travar da tela (sem motivo explícito) vira trava manual sem prazo');
commit;

-- Bloqueio do número vira evento
update clientes set ia_bloqueada = true where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.checar((select motivo = 'numero_bloqueado' and estado_novo = 'BLOQUEADA'
                         from conversa_eventos_ia where conversa_id = :bruno order by criado_em desc limit 1),
                      'bloquear o número registra evento BLOQUEADA');
update clientes set ia_bloqueada = false where id = '10000000-0000-0000-0000-000000000002';

-- Webhook repetido: mesma mensagem externa não entra duas vezes
insert into mensagens (conversa_id, remetente, conteudo, externo_id) values (:bruno, 'cliente', 'oi', 'WA-123');
do $$
begin
  begin
    insert into mensagens (conversa_id, remetente, conteudo, externo_id)
    values ('20000000-0000-0000-0000-000000000002', 'cliente', 'oi', 'WA-123');
    raise exception 'FALHOU: mensagem duplicada foi aceita';
  exception when unique_violation then
    raise notice 'ok - mensagem repetida do webhook é recusada pelo banco';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rotina das 22h
-- ---------------------------------------------------------------------------
-- Cenário: Ana (legado), Bruno (manual), Carla (bloqueada) e mais duas
-- conversas: uma transferida pela IA e uma pausada pelo chat.
insert into clientes (id, nome, telefone) values
  ('10000000-0000-0000-0000-000000000004', 'Davi Transferido', '557100000004'),
  ('10000000-0000-0000-0000-000000000005', 'Eva Pausada', '557100000005');
insert into conversas (id, cliente_id, status) values
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'aberta'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'aberta');
update conversas set status = 'aguardando_humano', ia_motivo = 'transferencia_ia', ia_ator = 'ia'
  where id = '20000000-0000-0000-0000-000000000004';
update conversas set status = 'aguardando_humano', ia_motivo = 'resposta_crm', ia_pausada_ate = now() + interval '5 minutes'
  where id = '20000000-0000-0000-0000-000000000005';

create temp table msgs_antes as select count(*) as n from mensagens;

select pg_temp.checar((recuperar_atendimentos_ia('manual', true, 'teste')->>'seriam_reativadas')::int = 3,
                      'simulação conta 3 elegíveis (legado, transferência, pausa)');
select pg_temp.checar((select count(*) = 5 from conversas where status = 'aguardando_humano'),
                      'simulação não altera nada');

create temp table r1 as select recuperar_atendimentos_ia('agendada', false, 'cron') as r;
select pg_temp.checar((select (r->>'reativadas')::int = 3 from r1), 'rotina reativa 3 conversas');
select pg_temp.checar((select (r->>'preservadas_numero_bloqueado')::int = 1 and (r->>'preservadas_trava_manual')::int = 1 from r1),
                      'rotina informa 1 número bloqueado e 1 trava manual preservados');
select pg_temp.checar((select status = 'aguardando_humano' from conversas where id = :carla), 'número bloqueado continua bloqueado');
select pg_temp.checar((select ia_bloqueada from clientes where id = '10000000-0000-0000-0000-000000000003'), 'flag de bloqueio do número intacta');
select pg_temp.checar((select status = 'aguardando_humano' and ia_motivo = 'manual' from conversas where id = :bruno), 'trava manual preservada');
select pg_temp.checar((select bool_and(status = 'aberta' and ia_motivo = 'recuperacao_22h' and ia_evento_id like 'rotina:%')
                         from conversas where id in (:ana, '20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000005')),
                      'elegíveis voltam pra aberta com motivo recuperacao_22h e id da execução');
select pg_temp.checar((select count(*) = 3 from conversa_eventos_ia where motivo = 'recuperacao_22h' and estado_novo = 'IA_ATIVA'),
                      'cada reativação gera um evento');
select pg_temp.checar((select n from msgs_antes) = (select count(*) from mensagens), 'nenhuma mensagem é criada pela reativação');
select pg_temp.checar((select atualizado_em = '2026-01-01T10:00:00Z' from conversas where id = :ana), 'reativação não reordena a lista do chat');
select pg_temp.checar((select count(*) = 1 from rotinas_execucoes where origem = 'agendada' and status = 'concluida'), 'execução registrada');

-- Idempotência: segunda execução agendada no mesmo dia não faz nada
update conversas set status = 'aguardando_humano', ia_motivo = 'transferencia_ia' where id = :ana;
select pg_temp.checar((recuperar_atendimentos_ia('agendada', false, 'cron')->>'ja_executada')::boolean,
                      'segunda execução agendada no mesmo dia é ignorada');
select pg_temp.checar((select status = 'aguardando_humano' from conversas where id = :ana), 'execução repetida não altera estados');
-- Execução manual (painel) pode rodar de novo
select pg_temp.checar((recuperar_atendimentos_ia('manual', false, 'usuario:dona')->>'reativadas')::int = 1, 'execução manual reativa de novo');
select pg_temp.checar((select ia_motivo = 'recuperacao_manual' from conversas where id = :ana), 'motivo da execução manual é recuperacao_manual');

-- Fuso: 22:00 de Salvador = 01:00 UTC do dia seguinte; o dia de referência é o de Salvador
select pg_temp.checar(((timestamptz '2026-11-06 01:00:00+00') at time zone 'America/Bahia')::time = '22:00',
                      'cron 01:00 UTC corresponde a 22:00 em America/Bahia');
select pg_temp.checar(((timestamptz '2026-11-06 01:30:00+00') at time zone 'America/Bahia')::date = '2026-11-05',
                      'execução das 22:30 conta como o mesmo dia em Salvador');

-- Falha parcial: um erro no meio desfaz tudo, registra a falha e abre 1 tarefa
update conversas set status = 'aguardando_humano', ia_motivo = 'legado' where id in (:ana, '20000000-0000-0000-0000-000000000004');
create or replace function pg_temp.falhar() returns trigger as $$
begin
  if new.id = '20000000-0000-0000-0000-000000000004' and new.status = 'aberta' then
    raise exception 'falha simulada';
  end if;
  return new;
end $$ language plpgsql;
create trigger trg_falha_teste before update on conversas for each row execute function pg_temp.falhar();
select recuperar_atendimentos_ia('manual', false, 'teste');
select recuperar_atendimentos_ia('manual', false, 'teste');
drop trigger trg_falha_teste on conversas;
select pg_temp.checar((select count(*) = 2 from conversas where id in (:ana, '20000000-0000-0000-0000-000000000004') and status = 'aguardando_humano'),
                      'falha no meio não deixa estado pela metade (nenhuma conversa alterada)');
select pg_temp.checar((select count(*) = 2 from rotinas_execucoes where status = 'falhou' and erro like '%falha simulada%'), 'falhas registradas com o erro');
select pg_temp.checar((select count(*) = 1 from tarefas where chave_dedup = 'rotina_falhou:recuperacao_ia_22h' and status = 'PENDENTE'),
                      'falha repetida abre uma única tarefa técnica');

-- ---------------------------------------------------------------------------
-- 5. Central de Tarefas
-- ---------------------------------------------------------------------------
select pg_temp.checar((abrir_tarefa('{"titulo":"Cliente reclamou do atraso","categoria":"reclamacao","prioridade":"urgente","origem":"ia","chave_dedup":"reclamacao:x","ator":"ia"}')->>'criada')::boolean,
                      'abrir_tarefa cria tarefa nova');
select pg_temp.checar(not (abrir_tarefa('{"titulo":"Cliente reclamou do atraso","chave_dedup":"reclamacao:x"}')->>'criada')::boolean,
                      'mesma chave com tarefa aberta não duplica');
select pg_temp.checar((select count(*) = 1 from tarefa_historico h join tarefas t on t.id = h.tarefa_id
                         where t.chave_dedup = 'reclamacao:x' and h.acao = 'criada' and h.ator = 'ia'), 'histórico registra criação e ator');
update tarefas set status = 'CONCLUIDA' where chave_dedup = 'reclamacao:x';
select pg_temp.checar((select concluida_em is not null from tarefas where chave_dedup = 'reclamacao:x'), 'concluir grava concluida_em');
select pg_temp.checar((abrir_tarefa('{"titulo":"Cliente reclamou de novo","chave_dedup":"reclamacao:x"}')->>'criada')::boolean,
                      'depois de concluída, o mesmo problema pode abrir tarefa nova');
do $$
begin
  begin
    perform abrir_tarefa('{"titulo":"x","prioridade":"altissima"}');
    raise exception 'FALHOU: prioridade inválida aceita';
  exception when check_violation then
    raise notice 'ok - prioridade inválida é recusada';
  end;
end $$;

-- Pedido atrasado: cria uma vez, ignora pedido antigo, fecha sozinha quando anda
insert into pedidos (id, cliente_id, status, criado_em) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'novo', now() - interval '3 hours'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'novo', now() - interval '5 days'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'separando', now() - interval '10 minutes');
select pg_temp.checar((verificar_pedidos_atrasados()->>'tarefas_criadas')::int = 1, 'só o pedido parado há 3h (e recente) vira tarefa');
select pg_temp.checar((verificar_pedidos_atrasados()->>'tarefas_criadas')::int = 0, 'rodar de novo não duplica a tarefa');
update pedidos set status = 'pronto' where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.checar((select status = 'CONCLUIDA' and observacoes like '%Resolvida automaticamente%'
                         from tarefas where chave_dedup = 'pedido_atrasado:30000000-0000-0000-0000-000000000001'),
                      'tarefa de atraso conclui sozinha quando o pedido anda');

-- ---------------------------------------------------------------------------
-- 6. Painel e mensagens automáticas
-- ---------------------------------------------------------------------------
select pg_temp.checar((painel_operacoes_ia()->>'bloqueadas')::int = 1, 'painel conta 1 número bloqueado');
select pg_temp.checar((select count(*) = 6 from mensagens_automaticas), 'textos padrão das mensagens automáticas criados');
select pg_temp.checar((select valor = 'false' from configuracoes where chave = 'notificacoes_pedido_ativas'), 'avisos de pedido nascem DESLIGADOS');
insert into pedido_notificacoes (pedido_id, evento) values ('30000000-0000-0000-0000-000000000001', 'pedido_pronto_retirada');
do $$
begin
  begin
    insert into pedido_notificacoes (pedido_id, evento) values ('30000000-0000-0000-0000-000000000001', 'pedido_pronto_retirada');
    raise exception 'FALHOU: aviso duplicado aceito';
  exception when unique_violation then
    raise notice 'ok - o mesmo aviso de pedido não pode ser reservado duas vezes';
  end;
end $$;

-- Permissões: funções sensíveis não podem ser chamadas pela chave pública
select pg_temp.checar(not has_function_privilege('anon', 'recuperar_atendimentos_ia(text, boolean, text)', 'execute'), 'anon não executa a rotina');
select pg_temp.checar(not has_function_privilege('authenticated', 'abrir_tarefa(jsonb)', 'execute'), 'usuário logado não chama abrir_tarefa direto');
select pg_temp.checar(not has_function_privilege('authenticated', 'painel_operacoes_ia()', 'execute'), 'painel só pelo servidor');

\echo 'TODOS OS TESTES SQL PASSARAM'
