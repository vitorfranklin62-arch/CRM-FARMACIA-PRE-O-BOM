-- ============================================================================
-- Migração única: mescla clientes duplicados (mesmo telefone, ids diferentes)
-- e adiciona a trava que impede isso de acontecer de novo.
--
-- Causa raiz: os webhooks resolviam "esse telefone já é cliente?" com um
-- SELECT seguido de um INSERT — dois passos separados, sem trava no banco.
-- Quando duas mensagens do mesmo número chegavam quase juntas, as duas
-- passavam pelo SELECT antes de qualquer uma terminar o INSERT, e cada uma
-- criava um cliente novo pro mesmo telefone. A partir daí o problema se
-- autoalimenta: toda consulta seguinte por telefone passa a bater em 2+
-- linhas — o que o Supabase trata como erro —, e o código antigo ignorava
-- esse erro e criava mais um cliente a cada mensagem seguinte.
--
-- Rode este arquivo INTEIRO de uma vez só no SQL Editor do Supabase.
-- É seguro rodar mais de uma vez (idempotente) — se não houver mais
-- duplicata, os passos abaixo simplesmente não alteram nada.
-- Tudo roda dentro de uma transação: se algo der errado no meio, nada é
-- alterado (rollback automático).
-- ============================================================================

begin;

-- PASSO 1 — mapear cada cliente duplicado pro seu "sobrevivente"
-- (o cliente mais antigo — menor criado_em — de cada telefone repetido).
create temporary table _dup_clientes as
select
  id,
  first_value(id) over (partition by telefone order by criado_em asc, id asc) as sobrevivente_id
from clientes;

delete from _dup_clientes where id = sobrevivente_id;

select count(*) as clientes_duplicados_encontrados from _dup_clientes;

-- PASSO 2 — reaponta conversas e pedidos das duplicatas pro sobrevivente
-- (precisa vir ANTES de apagar as duplicatas: conversas.cliente_id é
-- "on delete cascade" — apagar o cliente sem reapontar primeiro apagaria
-- as conversas e mensagens junto).
update conversas c
set cliente_id = d.sobrevivente_id
from _dup_clientes d
where c.cliente_id = d.id;

update pedidos p
set cliente_id = d.sobrevivente_id
from _dup_clientes d
where p.cliente_id = d.id;

-- PASSO 3 — apaga os clientes duplicados (já sem nada apontando pra eles)
delete from clientes c
using _dup_clientes d
where c.id = d.id;

drop table _dup_clientes;

-- PASSO 4 — cada cliente agora é único, mas pode ter sobrado mais de uma
-- conversa por cliente (uma por duplicata que existia). Mescla do mesmo
-- jeito que o botão "Mesclar conversas duplicadas" da tela de Chat faz:
-- sobrevivente = conversa mais recentemente atualizada; move as mensagens
-- das outras pra ela; carrega pedido_id e status "aguardando_humano" se
-- alguma duplicata tinha; apaga as conversas que sobraram vazias.
create temporary table _dup_conversas as
select
  id,
  cliente_id,
  first_value(id) over (partition by cliente_id order by atualizado_em desc, id asc) as sobrevivente_id
from conversas;

delete from _dup_conversas where id = sobrevivente_id;

select count(*) as conversas_duplicadas_encontradas from _dup_conversas;

update mensagens m
set conversa_id = d.sobrevivente_id
from _dup_conversas d
where m.conversa_id = d.id;

update conversas c
set pedido_id = coalesce(c.pedido_id, sub.pedido_id),
    status = case when sub.tem_aguardando_humano then 'aguardando_humano' else c.status end
from (
  select
    d.sobrevivente_id,
    (array_agg(orig.pedido_id) filter (where orig.pedido_id is not null))[1] as pedido_id,
    bool_or(orig.status = 'aguardando_humano') as tem_aguardando_humano
  from _dup_conversas d
  join conversas orig on orig.id = d.id
  group by d.sobrevivente_id
) sub
where c.id = sub.sobrevivente_id;

delete from conversas c
using _dup_conversas d
where c.id = d.id;

drop table _dup_conversas;

-- PASSO 5 — a trava de verdade: impede qualquer duplicata futura no banco,
-- não importa o que o código da aplicação faça (mesmo que outro bug ou
-- outra integração tente criar 2 clientes pro mesmo telefone, o Postgres
-- vai recusar o segundo).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_telefone_key') then
    alter table clientes add constraint clientes_telefone_key unique (telefone);
  end if;
end $$;

commit;

-- Depois de rodar: confira em Clientes/Chat que a lista voltou ao normal.
