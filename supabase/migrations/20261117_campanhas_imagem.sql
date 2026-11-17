-- ============================================================================
-- Campanhas com imagem (foto + legenda numa mensagem só do WhatsApp)
--
-- Até aqui a campanha só tinha texto (`campanhas.mensagem`). Agora ela pode
-- levar UMA imagem (JPG/PNG). O texto continua em `mensagem` e vira a legenda
-- da foto; com imagem, ele pode ficar vazio ("somente imagem").
--
-- Esta migração só ADICIONA coisas:
--   1. três colunas novas e opcionais em `campanhas` (caminho, tipo e tamanho
--      do arquivo). Campanha antiga fica com as três vazias = campanha de texto,
--      exatamente como antes;
--   2. regras de coerência dessas colunas (só valem para linhas novas/alteradas);
--   3. uma trava que impede trocar texto/imagem depois que o disparo começou
--      (todo mundo recebe a mesma campanha);
--   4. o bucket PRIVADO `campanha-midia` no Storage.
-- Nenhuma tabela, coluna ou linha existente é removida ou reescrita.
-- Pode rodar mais de uma vez. Rodar no SQL editor do Supabase ANTES de
-- publicar a versão nova do CRM.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas da imagem
-- ----------------------------------------------------------------------------
alter table campanhas add column if not exists midia_path text;
alter table campanhas add column if not exists midia_mime text;
alter table campanhas add column if not exists midia_tamanho integer;

comment on column campanhas.midia_path is
  'Imagem da campanha: caminho dentro do bucket privado "campanha-midia" ({campanha_id}/{imagem_id}.jpg). Vazio = campanha só de texto. O link que a uazapi baixa é gerado na hora de montar cada lote (src/lib/campanhas/midia.ts).';
comment on column campanhas.midia_mime is
  'Tipo do arquivo da imagem: image/jpeg ou image/png.';
comment on column campanhas.midia_tamanho is
  'Tamanho da imagem em bytes (máximo 5 MB).';
comment on column campanhas.mensagem is
  'Texto da campanha. Com imagem, é a legenda da foto (pode ficar vazio). Aceita {{nome}} e {{saudacao}}.';

-- ----------------------------------------------------------------------------
-- 2. Coerência
-- ----------------------------------------------------------------------------
-- As três colunas andam juntas, o arquivo fica na pasta da PRÓPRIA campanha
-- (uma campanha não aponta pra imagem de outra) e só JPG/PNG de até 5 MB.
alter table campanhas drop constraint if exists campanhas_midia_check;
alter table campanhas add constraint campanhas_midia_check check (
  (midia_path is null and midia_mime is null and midia_tamanho is null)
  or (
    -- "is not null" explícito nos três: com NULL, `in (...)`/`between` dariam
    -- "desconhecido" e o Postgres deixaria passar dados pela metade.
    midia_path is not null
    and midia_mime is not null
    and midia_tamanho is not null
    and split_part(midia_path, '/', 1) = id::text
    and midia_mime in ('image/jpeg', 'image/png')
    and midia_tamanho between 1 and 5242880
  )
);

-- Campanha precisa ter texto OU imagem. `not valid`: vale para o que entrar
-- daqui pra frente e não reavalia as campanhas antigas.
alter table campanhas drop constraint if exists campanhas_conteudo_check;
alter table campanhas add constraint campanhas_conteudo_check
  check (btrim(mensagem) <> '' or midia_path is not null) not valid;

-- ----------------------------------------------------------------------------
-- 3. Conteúdo congelado depois que o disparo começa
-- ----------------------------------------------------------------------------
-- Assim que existe alguém registrado no disparo (fora os "cancelado", que nunca
-- saíram), texto e imagem não mudam mais: quem recebe no lote 10 recebe a
-- mesma coisa que quem recebeu no lote 1.
create or replace function campanhas_congelar_conteudo() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.mensagem is distinct from old.mensagem
      or new.midia_path is distinct from old.midia_path
      or new.midia_mime is distinct from old.midia_mime
      or new.midia_tamanho is distinct from old.midia_tamanho)
     and exists (
       select 1 from campanha_envios
       where campanha_id = old.id and status <> 'cancelado'
     )
  then
    raise exception 'O texto e a imagem da campanha não podem mudar depois que o disparo começou.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_campanhas_congelar_conteudo on campanhas;
create trigger trg_campanhas_congelar_conteudo
  before update on campanhas
  for each row execute function campanhas_congelar_conteudo();

-- ----------------------------------------------------------------------------
-- 4. Bucket privado das imagens
-- ----------------------------------------------------------------------------
-- Privado e sem políticas para usuários logados: só o servidor do CRM (chave
-- service_role) sobe, lê e apaga. A uazapi recebe um link assinado gerado no
-- momento de montar cada lote. O próprio Storage também recusa arquivo acima
-- de 5 MB ou fora de JPG/PNG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campanha-midia', 'campanha-midia', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
