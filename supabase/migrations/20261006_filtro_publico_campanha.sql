-- ============================================================================
-- Campanhas: filtro de público (quem recebe)
--
-- Uma função só decide quem entra numa campanha. Tanto a tela do CRM (prévia
-- "X clientes vão receber") quanto o N8N (disparo de verdade) chamam esta
-- função, então o número que a dona vê é exatamente o que será enviado.
--
-- Só ADICIONA uma função — nenhuma tabela, coluna ou dado é alterado.
-- Compatível com campanhas antigas: filtro_json = {"origem_chat":"whatsapp"}
-- continua funcionando igual.
--
-- Formato do filtro (todos os campos são opcionais e se combinam com E):
--   origem_chat              "whatsapp" | "instagram"
--   tag_ids                  ["uuid", ...]  clientes com QUALQUER uma dessas tags
--   cliente_ids              ["uuid", ...]  só esses clientes (escolha manual)
--   interagiu_ultimos_dias   número         falou com a farmácia nos últimos N dias
--   inativos_ha_dias         número         NÃO fala com a farmácia há N dias (ou nunca falou)
--
-- Quem pediu pra sair (aceita_campanhas = false) NUNCA entra, qualquer que seja o filtro.
-- ============================================================================

create or replace function filtrar_clientes_campanha(filtro jsonb default null)
returns table (id uuid, nome text, telefone text, origem_chat text)
language sql
stable
as $$
  select c.id, c.nome, c.telefone, c.origem_chat
  from clientes c
  where c.aceita_campanhas
    and (
      filtro is null
      or coalesce(filtro->>'origem_chat', '') = ''
      or c.origem_chat = filtro->>'origem_chat'
    )
    and (
      filtro is null
      or jsonb_typeof(filtro->'cliente_ids') is distinct from 'array'
      or jsonb_array_length(filtro->'cliente_ids') = 0
      or c.id::text in (select jsonb_array_elements_text(filtro->'cliente_ids'))
    )
    and (
      filtro is null
      or jsonb_typeof(filtro->'tag_ids') is distinct from 'array'
      or jsonb_array_length(filtro->'tag_ids') = 0
      or exists (
        select 1 from cliente_tags ct
        where ct.cliente_id = c.id
          and ct.tag_id::text in (select jsonb_array_elements_text(filtro->'tag_ids'))
      )
    )
    and (
      filtro is null
      or coalesce(filtro->>'interagiu_ultimos_dias', '') = ''
      or c.ultima_interacao >= now() - make_interval(days => (filtro->>'interagiu_ultimos_dias')::int)
    )
    and (
      filtro is null
      or coalesce(filtro->>'inativos_ha_dias', '') = ''
      or c.ultima_interacao is null
      or c.ultima_interacao < now() - make_interval(days => (filtro->>'inativos_ha_dias')::int)
    )
  order by c.nome
  limit 5000;
$$;

comment on function filtrar_clientes_campanha(jsonb) is
  'Devolve os clientes que recebem uma campanha, dado o filtro_json dela. Usada pelo CRM (prévia) e pelo N8N (disparo).';

-- Roda com as permissões de quem chama: o app respeita o RLS de clientes
-- (usuário ativo), e o N8N (service_role) enxerga tudo, como já fazia.
revoke all on function filtrar_clientes_campanha(jsonb) from public, anon;
grant execute on function filtrar_clientes_campanha(jsonb) to authenticated, service_role;
