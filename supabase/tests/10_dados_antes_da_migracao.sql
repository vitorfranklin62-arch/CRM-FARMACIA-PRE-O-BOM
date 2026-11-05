-- Dados de teste no estado ANTERIOR às migrações de 20261105 (simula produção
-- com conversas travadas sem motivo). Telefones fictícios.
insert into usuarios (id, email, nome, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'dona@teste.local', 'Dona Teste', 'dona');

insert into clientes (id, nome, telefone, ultima_interacao) values
  ('10000000-0000-0000-0000-000000000001', 'Ana Legado', '557100000001', now()),
  ('10000000-0000-0000-0000-000000000002', 'Bruno Aberto', '557100000002', now()),
  ('10000000-0000-0000-0000-000000000003', 'Carla Bloqueada', '5571999654233', now());

update clientes set ia_bloqueada = true, ia_bloqueada_em = now() where id = '10000000-0000-0000-0000-000000000003';

insert into conversas (id, cliente_id, status, atualizado_em) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aguardando_humano', '2026-01-01T10:00:00Z'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'aberta', '2026-01-01T11:00:00Z'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'aguardando_humano', '2026-01-01T12:00:00Z');

-- A trigger genérica carimba now() no insert/update; força o valor antigo de
-- atualizado_em pra conferir depois que a migração não reordena a lista.
alter table conversas disable trigger trg_conversas_atualizado_em;
update conversas set atualizado_em = '2026-01-01T10:00:00Z' where id = '20000000-0000-0000-0000-000000000001';
alter table conversas enable trigger trg_conversas_atualizado_em;
