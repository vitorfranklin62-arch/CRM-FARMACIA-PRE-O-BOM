-- ============================================================================
-- Campanhas: status "pausada" + motivo da pausa
--
-- Até hoje, quando o disjuntor do N8N parava um disparo (5 falhas seguidas),
-- a campanha voltava pra "rascunho" — igual a uma campanha que nunca foi
-- disparada. A dona não tinha como saber que algo deu errado. Agora ela fica
-- "pausada", com o motivo, e o CRM mostra isso na tela.
--
-- Só ADICIONA coluna e AMPLIA a lista de status aceitos (a regra antiga
-- continua valendo pra rascunho/agendada/enviada). Nenhum dado é alterado.
-- Rodar no SQL editor do Supabase ANTES de importar o fluxo novo do N8N.
-- ============================================================================

alter table campanhas add column if not exists motivo_pausa text;

comment on column campanhas.motivo_pausa is
  'Preenchido pelo N8N quando o disparo é pausado (ex.: disjuntor de falhas seguidas, instância desconectada). Limpo ao retomar.';

-- A trava de status foi criada inline no schema.sql, então o nome é gerado pelo
-- Postgres. Em vez de assumir o nome, procura a trava que olha a coluna status.
do $$
declare
  trava text;
begin
  select c.conname into trava
  from pg_constraint c
  where c.conrelid = 'campanhas'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%';

  if trava is not null then
    execute format('alter table campanhas drop constraint %I', trava);
  end if;

  alter table campanhas
    add constraint campanhas_status_check
    check (status in ('rascunho', 'agendada', 'enviada', 'pausada'));
end $$;
