-- ============================================================================
-- Campanhas: disparo pelo recurso nativo de "Mensagem em massa" da uazapi
--
-- Até aqui o N8N mandava uma mensagem por vez (/send/text) e ficava horas com
-- uma execução aberta, esperando entre um envio e outro. Agora o CRM monta
-- lotes pequenos (20 pessoas) e entrega cada lote pra fila de campanhas da
-- própria uazapi (POST /sender/advanced), que cuida do intervalo entre as
-- mensagens, sobrevive a reinício e devolve o resultado por mensagem.
--
-- Esta migração só ADICIONA coisas:
--   1. tabela campanha_lotes (um registro por campanha criada na uazapi);
--   2. colunas novas em campanha_envios (lote, id da mensagem, entrega, leitura);
--   3. dois status novos aceitos em campanha_envios ('agendado' e 'cancelado').
-- Nenhuma tabela, coluna ou linha existente é removida ou reescrita.
-- Rodar no SQL editor do Supabase ANTES de publicar a versão nova do CRM.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Lotes enviados pra uazapi
-- ----------------------------------------------------------------------------
create table if not exists campanha_lotes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas(id) on delete cascade,
  -- `folder_id` devolvido pela uazapi. Fica vazio só no instante entre gravar
  -- o lote aqui e a uazapi responder (status 'criando').
  folder_id text unique,
  status text not null default 'criando'
    check (status in ('criando', 'agendado', 'enviando', 'pausado', 'concluido', 'cancelado', 'falhou')),
  total integer not null default 0,
  agendado_para timestamptz,
  -- true quando quem pausou foi a janela de horário (e não a dona nem o
  -- disjuntor): só esses lotes são retomados sozinhos quando a janela abre.
  pausado_pela_janela boolean not null default false,
  -- Última retomada. O disjuntor só conta falhas depois dela — senão as
  -- falhas que causaram a pausa pausariam de novo logo depois do "Retomar".
  retomado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz
);

comment on table campanha_lotes is
  'Cada lote é uma campanha criada na uazapi (POST /sender/advanced). O CRM cria, acompanha e fecha os lotes.';

create index if not exists idx_campanha_lotes_campanha on campanha_lotes (campanha_id);

-- Um lote rodando de cada vez na instância inteira: é isso que garante o
-- ritmo humano (a uazapi não junta duas campanhas na mesma fila) e impede que
-- duas chamadas quase simultâneas criem dois lotes pra mesma gente.
create unique index if not exists idx_campanha_lotes_um_ativo
  on campanha_lotes ((true))
  where status in ('criando', 'agendado', 'enviando');

-- No máximo um lote em aberto (inclusive pausado) por campanha.
create unique index if not exists idx_campanha_lotes_um_aberto_por_campanha
  on campanha_lotes (campanha_id)
  where status in ('criando', 'agendado', 'enviando', 'pausado');

alter table campanha_lotes enable row level security;

-- O app só lê (relatório na tela). Quem escreve é o servidor, com service_role.
drop policy if exists campanha_lotes_select on campanha_lotes;
create policy campanha_lotes_select on campanha_lotes for select
  using (is_usuario_ativo());

-- ----------------------------------------------------------------------------
-- 2. campanha_envios: acompanhamento por mensagem
-- ----------------------------------------------------------------------------
alter table campanha_envios add column if not exists lote_id uuid references campanha_lotes(id) on delete set null;
alter table campanha_envios add column if not exists message_id text;
alter table campanha_envios add column if not exists entregue_em timestamptz;
alter table campanha_envios add column if not exists lido_em timestamptz;

comment on column campanha_envios.message_id is
  'ID da mensagem no WhatsApp (messageid da uazapi). É por ele que os recibos de entrega/leitura chegam.';
comment on column campanha_envios.enviado_em is
  'Com status ''agendado'': quando a pessoa entrou num lote. Depois que a uazapi envia, vira a hora real do envio.';

create index if not exists idx_campanha_envios_lote on campanha_envios (lote_id);
create index if not exists idx_campanha_envios_message_id on campanha_envios (message_id) where message_id is not null;

-- Amplia a lista de status aceitos. 'agendado' = está num lote da uazapi
-- esperando a vez; 'cancelado' = o lote foi descartado antes de enviar (a
-- pessoa volta a ser elegível num lote seguinte). A trava foi criada inline,
-- então o nome é gerado pelo Postgres: procura a que olha a coluna status.
do $$
declare
  trava text;
begin
  for trava in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'campanha_envios'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table campanha_envios drop constraint %I', trava);
  end loop;

  alter table campanha_envios
    add constraint campanha_envios_status_check
    check (status in ('agendado', 'enviado', 'falhou', 'sem_whatsapp', 'invalido', 'cancelado'));
end $$;
