-- ============================================================================
-- Campanhas: proteção anti-ban do disparo por WhatsApp
--
-- O disparo antigo mandava tudo de uma vez, sem registrar quem já recebeu e
-- sem respeitar quem pediu pra sair. As duas coisas que mais derrubam número
-- são: (1) rajada de mensagens idênticas em sequência e (2) gente clicando
-- em "denunciar spam" por não ter como se descadastrar.
--
-- Esta migração só ADICIONA coisas — nenhuma coluna ou tabela é removida,
-- nada é reescrito. Rodar no SQL editor do Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Descadastro (opt-out) do cliente
-- ----------------------------------------------------------------------------
-- Default true: todo mundo que já está no banco continua recebendo como
-- antes. Só sai quem pedir pra sair.
alter table clientes add column if not exists aceita_campanhas boolean not null default true;
alter table clientes add column if not exists optout_em timestamptz;

comment on column clientes.aceita_campanhas is
  'false quando o cliente pediu pra não receber campanha. O disparo do N8N filtra por esta coluna.';
comment on column clientes.optout_em is
  'Quando o cliente pediu pra sair. Só pra histórico/LGPD.';

-- ----------------------------------------------------------------------------
-- 2. Log de envio por destinatário
-- ----------------------------------------------------------------------------
-- É isto que deixa o disparo ser retomado sem mandar duas vezes pra mesma
-- pessoa: se a execução do N8N cair no meio (ou o servidor reiniciar), a
-- próxima rodada pula quem já está registrado aqui.
create table if not exists campanha_envios (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  -- Telefone já normalizado (só dígitos, com DDI), que é como o disparo
  -- compara. Guardar o normalizado evita o mesmo contato passar duas vezes
  -- por estar formatado diferente no cadastro.
  telefone text not null,
  status text not null check (status in ('enviado', 'falhou', 'sem_whatsapp', 'invalido')),
  erro text,
  enviado_em timestamptz not null default now()
);

-- Chave de idempotência: o N8N insere com "Prefer: resolution=ignore-duplicates",
-- então uma repetição simplesmente não grava — e não reenvia.
create unique index if not exists idx_campanha_envios_unico
  on campanha_envios (campanha_id, telefone);

create index if not exists idx_campanha_envios_campanha on campanha_envios (campanha_id);
-- Usado pelo teto diário, que conta os envios do dia somando todas as campanhas.
create index if not exists idx_campanha_envios_enviado_em on campanha_envios (enviado_em);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
-- Mesmo padrão das outras tabelas do CRM. O N8N usa a service_role, que passa
-- por cima do RLS — estas políticas são pro app (dona/funcionária) conseguir
-- ler o relatório de envio na tela.
alter table campanha_envios enable row level security;

drop policy if exists campanha_envios_select on campanha_envios;
create policy campanha_envios_select on campanha_envios for select
  using (is_usuario_ativo());

drop policy if exists campanha_envios_insert on campanha_envios;
create policy campanha_envios_insert on campanha_envios for insert
  with check (is_dona());

drop policy if exists campanha_envios_delete on campanha_envios;
create policy campanha_envios_delete on campanha_envios for delete
  using (is_dona());
