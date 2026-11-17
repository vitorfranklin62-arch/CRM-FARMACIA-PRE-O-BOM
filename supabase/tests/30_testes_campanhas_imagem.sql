-- Testes da migração 20261117_campanhas_imagem.sql. Roda via supabase/tests/rodar.sh.
\set ON_ERROR_STOP 1

create or replace function pg_temp.checar(p_ok boolean, p_msg text) returns void as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$ language plpgsql;

-- Executa um comando que DEVE ser recusado pelo banco.
create or replace function pg_temp.recusa(p_sql text, p_msg text) returns void as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - %', p_msg;
    return;
  end;
  raise exception 'FALHOU: % (o banco aceitou)', p_msg;
end $$ language plpgsql;

\set antiga '\'30000000-0000-0000-0000-000000000001\''
\set nova '\'30000000-0000-0000-0000-000000000002\''
\set outra '\'30000000-0000-0000-0000-000000000003\''
\set dona '\'00000000-0000-0000-0000-0000000000d1\''

-- 1. Campanha antiga (texto) intacta -------------------------------------------
select pg_temp.checar((select midia_path is null and midia_mime is null and midia_tamanho is null
                         from campanhas where id = :antiga), 'campanha antiga continua sem imagem (= texto)');
select pg_temp.checar((select mensagem = E'Oi, {{nome}}!\nPromoção antiga.' and status = 'enviada'
                         from campanhas where id = :antiga), 'texto e status da campanha antiga não mudaram');
select pg_temp.checar((select count(*) = 1 from campanha_envios where campanha_id = :antiga), 'histórico de envio da campanha antiga preservado');

-- 2. Bucket privado com limites -----------------------------------------------
select pg_temp.checar((select public = false and file_size_limit = 5242880
                              and allowed_mime_types = array['image/jpeg', 'image/png']
                         from storage.buckets where id = 'campanha-midia'), 'bucket campanha-midia privado, 5 MB, só JPG/PNG');

-- 3. Campanha com imagem -------------------------------------------------------
insert into campanhas (id, titulo, mensagem, clientes_alvo, status, criado_por, midia_path, midia_mime, midia_tamanho)
values (:nova, 'Black Friday', E'🖤 Olá, {{nome}}! 💚\n🎟️ CUPOM: BLACK15', 'todos', 'rascunho', :dona,
        '30000000-0000-0000-0000-000000000002/0b1d8e5a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg', 'image/jpeg', 245000);
select pg_temp.checar((select midia_mime = 'image/jpeg' and mensagem like '%BLACK15%' from campanhas where id = :nova),
                      'campanha com imagem + legenda (emoji e quebra de linha) é salva');

insert into campanhas (id, titulo, mensagem, clientes_alvo, status, criado_por, midia_path, midia_mime, midia_tamanho)
values (:outra, 'Só imagem', '', 'todos', 'rascunho', :dona,
        '30000000-0000-0000-0000-000000000003/1b1d8e5a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png', 'image/png', 1000);
select pg_temp.checar(true, 'campanha só com imagem (sem texto) é aceita');

select pg_temp.recusa($$insert into campanhas (titulo, mensagem, clientes_alvo, criado_por)
                        values ('Vazia', '  ', 'todos', '00000000-0000-0000-0000-0000000000d1')$$,
                      'campanha sem texto e sem imagem é recusada');
select pg_temp.recusa($$insert into campanhas (id, titulo, mensagem, clientes_alvo, criado_por, midia_path, midia_mime, midia_tamanho)
                        values ('30000000-0000-0000-0000-000000000009', 'x', 'x', 'todos', '00000000-0000-0000-0000-0000000000d1',
                                '30000000-0000-0000-0000-000000000002/roubada.jpg', 'image/jpeg', 10)$$,
                      'campanha não pode apontar pra imagem da pasta de outra campanha');
select pg_temp.recusa($$insert into campanhas (id, titulo, mensagem, clientes_alvo, criado_por, midia_path, midia_mime, midia_tamanho)
                        values ('30000000-0000-0000-0000-000000000009', 'x', 'x', 'todos', '00000000-0000-0000-0000-0000000000d1',
                                '30000000-0000-0000-0000-000000000009/a.gif', 'image/gif', 10)$$,
                      'tipo de arquivo fora de JPG/PNG é recusado');
select pg_temp.recusa($$insert into campanhas (id, titulo, mensagem, clientes_alvo, criado_por, midia_path, midia_mime, midia_tamanho)
                        values ('30000000-0000-0000-0000-000000000009', 'x', 'x', 'todos', '00000000-0000-0000-0000-0000000000d1',
                                '30000000-0000-0000-0000-000000000009/a.jpg', 'image/jpeg', 6000000)$$,
                      'imagem acima de 5 MB é recusada');
select pg_temp.recusa($$insert into campanhas (id, titulo, mensagem, clientes_alvo, criado_por, midia_path)
                        values ('30000000-0000-0000-0000-000000000009', 'x', 'x', 'todos', '00000000-0000-0000-0000-0000000000d1',
                                '30000000-0000-0000-0000-000000000009/a.jpg')$$,
                      'caminho sem tipo/tamanho (dados pela metade) é recusado');

-- 4. Conteúdo congelado depois que o disparo começa ------------------------------
update campanhas set mensagem = mensagem || ' (editada)' where id = :nova;
select pg_temp.checar((select mensagem like '%(editada)' from campanhas where id = :nova), 'antes do disparo o texto ainda pode mudar');

-- Lote descartado ("cancelado") não conta como disparo começado.
insert into campanha_envios (campanha_id, telefone, status) values (:nova, '557100000005', 'cancelado');
update campanhas set midia_tamanho = 245001 where id = :nova;
select pg_temp.checar(true, 'envio cancelado não trava o conteúdo');

insert into campanha_envios (campanha_id, telefone, status) values (:nova, '557100000006', 'agendado');
select pg_temp.recusa($$update campanhas set mensagem = 'outra coisa' where id = '30000000-0000-0000-0000-000000000002'$$,
                      'depois do disparo começar, o texto não muda');
select pg_temp.recusa($$update campanhas set midia_path = null, midia_mime = null, midia_tamanho = null
                        where id = '30000000-0000-0000-0000-000000000002'$$,
                      'depois do disparo começar, a imagem não é trocada nem removida');
update campanhas set status = 'pausada', motivo_pausa = 'teste' where id = :nova;
update campanhas set status = 'agendada', motivo_pausa = null where id = :nova;
select pg_temp.checar((select status = 'agendada' from campanhas where id = :nova), 'pausar/retomar continua funcionando com o conteúdo travado');
update campanhas set status = 'enviada', enviada_em = now() where id = :antiga;
select pg_temp.checar(true, 'campanha antiga (texto) continua aceitando mudança de status');

\echo TODOS OS TESTES SQL PASSARAM
