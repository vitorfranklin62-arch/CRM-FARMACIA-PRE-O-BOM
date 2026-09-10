-- ============================================================================
-- Extrai a normalização de texto usada em buscar_produtos() e
-- calcular_taxa_entrega() (ignorar acento/caixa/espaço na comparação) pra
-- uma função só — as duas RPCs repetiam a mesma expressão
-- `regexp_replace(lower(x), '[^a-z0-9]', '', 'g')` várias vezes cada.
--
-- Só CREATE OR REPLACE — nenhuma tabela ou coluna é tocada, nada é
-- removido. Comportamento das duas RPCs continua idêntico (mesma regra de
-- normalização, só reaproveitada em vez de repetida). Rodar no SQL editor
-- do Supabase.
-- ============================================================================

create or replace function normalizar_busca(texto text)
returns text as $$
  select regexp_replace(lower(coalesce(texto, '')), '[^a-z0-9]', '', 'g');
$$ language sql immutable;

create or replace function buscar_produtos(termo text)
returns setof produtos as $$
  select *
  from produtos
  where normalizar_busca(nome) ilike '%' || normalizar_busca(termo) || '%'
     or normalizar_busca(observacoes) ilike '%' || normalizar_busca(termo) || '%'
  order by
    (normalizar_busca(nome) ilike '%' || normalizar_busca(termo) || '%') desc,
    nome
  limit 10;
$$ language sql stable;

create or replace function calcular_taxa_entrega(bairro_busca text)
returns table(bairro text, valor decimal) as $$
  select b.bairro, b.valor
  from bairros_entrega b
  where b.ativo
    and normalizar_busca(b.bairro) ilike '%' || normalizar_busca(bairro_busca) || '%'
  order by length(b.bairro) asc
  limit 1;
$$ language sql stable;
