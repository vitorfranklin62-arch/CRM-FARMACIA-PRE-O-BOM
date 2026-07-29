-- ============================================================================
-- CRM Farmácia Preço Bom — Schema completo (tabelas, enums, índices, RLS)
-- Rodar no SQL editor do Supabase (projeto novo) em ordem, de cima pra baixo.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- TABELAS
-- ============================================================================

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text not null,
  role text not null check (role in ('dona', 'funcionaria')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  origem_chat text check (origem_chat in ('whatsapp', 'instagram')),
  observacoes text,
  ultima_interacao timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  laboratorio text,
  preco decimal(10, 2) not null,
  estoque integer not null default 0,
  sku text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  status text not null default 'novo' check (status in ('novo', 'separando', 'pronto', 'entregue')),
  total decimal(10, 2),
  pagamento_status text not null default 'pendente' check (pagamento_status in ('pendente', 'confirmado')),
  endereco_entrega text,
  telefone_confirmacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade integer not null check (quantidade > 0),
  preco_unitario decimal(10, 2) not null,
  criado_em timestamptz not null default now()
);

create table if not exists conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  pedido_id uuid references pedidos(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta', 'aguardando_humano', 'fechada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id) on delete cascade,
  remetente text not null check (remetente in ('ia', 'cliente', 'funcionaria')),
  usuario_id uuid references usuarios(id),
  conteudo text not null,
  criado_em timestamptz not null default now()
);

create table if not exists templates_mensagem (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  conteudo text not null,
  categoria text check (categoria in ('confirmacao', 'promocao', 'duvida', 'outro')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensagem text not null,
  clientes_alvo text not null default 'todos' check (clientes_alvo in ('todos', 'por_filtro')),
  filtro_json jsonb,
  agendada_para timestamptz,
  status text not null default 'rascunho' check (status in ('rascunho', 'agendada', 'enviada')),
  enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid not null references usuarios(id)
);

create table if not exists vendas_log (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  valor_total decimal(10, 2) not null,
  data_venda date not null,
  criado_em timestamptz not null default now()
);

create table if not exists configuracoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  valor text,
  tipo text check (tipo in ('string', 'number', 'boolean', 'json')),
  atualizado_em timestamptz not null default now()
);

create table if not exists login_tentativas (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  sucesso boolean not null,
  ip text,
  criado_em timestamptz not null default now()
);

-- audit_log: registro básico de quem fez o quê (ações administrativas e
-- operacionais relevantes — não cobre cada mensagem de chat, que já tem
-- seu próprio histórico completo na tabela `mensagens`).
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id),
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

-- ============================================================================
-- ÍNDICES
-- ============================================================================

create index if not exists idx_pedidos_status on pedidos(status);
create index if not exists idx_pedidos_cliente_id on pedidos(cliente_id);
create index if not exists idx_itens_pedido_pedido_id on itens_pedido(pedido_id);
create index if not exists idx_conversas_cliente_id on conversas(cliente_id);
create index if not exists idx_conversas_status on conversas(status);
create index if not exists idx_mensagens_conversa_id on mensagens(conversa_id);
create index if not exists idx_clientes_telefone on clientes(telefone);
create index if not exists idx_vendas_log_data_venda on vendas_log(data_venda);
create index if not exists idx_login_tentativas_email on login_tentativas(email);
create index if not exists idx_audit_log_criado_em on audit_log(criado_em desc);
create index if not exists idx_audit_log_usuario_id on audit_log(usuario_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_usuarios_atualizado_em on usuarios;
create trigger trg_usuarios_atualizado_em before update on usuarios
  for each row execute function set_atualizado_em();

drop trigger if exists trg_produtos_atualizado_em on produtos;
create trigger trg_produtos_atualizado_em before update on produtos
  for each row execute function set_atualizado_em();

drop trigger if exists trg_pedidos_atualizado_em on pedidos;
create trigger trg_pedidos_atualizado_em before update on pedidos
  for each row execute function set_atualizado_em();

drop trigger if exists trg_conversas_atualizado_em on conversas;
create trigger trg_conversas_atualizado_em before update on conversas
  for each row execute function set_atualizado_em();

drop trigger if exists trg_templates_atualizado_em on templates_mensagem;
create trigger trg_templates_atualizado_em before update on templates_mensagem
  for each row execute function set_atualizado_em();

-- ============================================================================
-- Helpers para RLS (SECURITY DEFINER evita recursão nas policies de usuarios)
-- ============================================================================

create or replace function auth_role()
returns text as $$
  select role from usuarios where id = auth.uid() and ativo = true;
$$ language sql stable security definer set search_path = public;

create or replace function is_dona()
returns boolean as $$
  select coalesce((select auth_role() = 'dona'), false);
$$ language sql stable security definer set search_path = public;

create or replace function is_usuario_ativo()
returns boolean as $$
  select exists(select 1 from usuarios where id = auth.uid() and ativo = true);
$$ language sql stable security definer set search_path = public;

-- ============================================================================
-- Busca de produtos (usada pela IA via RPC) — ignora espaços e diferenças de
-- caixa na comparação, pra "500mg", "500 mg" e "500MG" encontrarem o mesmo
-- produto independente de como o texto veio (evita falso "sem estoque").
-- ============================================================================

create or replace function buscar_produtos(termo text)
returns setof produtos as $$
  select *
  from produtos
  where regexp_replace(lower(nome), '[^a-z0-9]', '', 'g')
        ilike '%' || regexp_replace(lower(termo), '[^a-z0-9]', '', 'g') || '%'
  order by nome
  limit 10;
$$ language sql stable;

-- ============================================================================
-- RLS
-- ============================================================================

alter table usuarios enable row level security;
alter table clientes enable row level security;
alter table produtos enable row level security;
alter table pedidos enable row level security;
alter table itens_pedido enable row level security;
alter table conversas enable row level security;
alter table mensagens enable row level security;
alter table templates_mensagem enable row level security;
alter table campanhas enable row level security;
alter table vendas_log enable row level security;
alter table configuracoes enable row level security;
alter table login_tentativas enable row level security;
alter table audit_log enable row level security;

-- usuarios: cada um vê o próprio registro; dona vê e gerencia todos
drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios for select
  using (id = auth.uid() or is_dona());

drop policy if exists usuarios_insert on usuarios;
create policy usuarios_insert on usuarios for insert
  with check (is_dona());

drop policy if exists usuarios_update on usuarios;
create policy usuarios_update on usuarios for update
  using (id = auth.uid() or is_dona());

drop policy if exists usuarios_delete on usuarios;
create policy usuarios_delete on usuarios for delete
  using (is_dona());

-- clientes: qualquer usuário ativo (dona ou funcionária) pode ver/gerenciar
drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes for select
  using (is_usuario_ativo());

drop policy if exists clientes_insert on clientes;
create policy clientes_insert on clientes for insert
  with check (is_usuario_ativo());

drop policy if exists clientes_update on clientes;
create policy clientes_update on clientes for update
  using (is_usuario_ativo());

-- produtos: leitura para todos ativos, escrita só dona
drop policy if exists produtos_select on produtos;
create policy produtos_select on produtos for select
  using (is_usuario_ativo());

drop policy if exists produtos_write on produtos;
create policy produtos_write on produtos for insert with check (is_dona());
drop policy if exists produtos_update on produtos;
create policy produtos_update on produtos for update using (is_dona());
drop policy if exists produtos_delete on produtos;
create policy produtos_delete on produtos for delete using (is_dona());

-- pedidos: qualquer usuário ativo vê e atualiza status (fila de separação)
drop policy if exists pedidos_select on pedidos;
create policy pedidos_select on pedidos for select
  using (is_usuario_ativo());

drop policy if exists pedidos_insert on pedidos;
create policy pedidos_insert on pedidos for insert
  with check (is_usuario_ativo());

drop policy if exists pedidos_update on pedidos;
create policy pedidos_update on pedidos for update
  using (is_usuario_ativo());

-- itens_pedido: leitura para todos ativos
drop policy if exists itens_pedido_select on itens_pedido;
create policy itens_pedido_select on itens_pedido for select
  using (is_usuario_ativo());

drop policy if exists itens_pedido_insert on itens_pedido;
create policy itens_pedido_insert on itens_pedido for insert
  with check (is_usuario_ativo());

-- conversas: qualquer usuário ativo vê/gerencia (chat ao vivo)
drop policy if exists conversas_select on conversas;
create policy conversas_select on conversas for select
  using (is_usuario_ativo());

drop policy if exists conversas_insert on conversas;
create policy conversas_insert on conversas for insert
  with check (is_usuario_ativo());

drop policy if exists conversas_update on conversas;
create policy conversas_update on conversas for update
  using (is_usuario_ativo());

-- mensagens: qualquer usuário ativo vê/envia
drop policy if exists mensagens_select on mensagens;
create policy mensagens_select on mensagens for select
  using (is_usuario_ativo());

drop policy if exists mensagens_insert on mensagens;
create policy mensagens_insert on mensagens for insert
  with check (is_usuario_ativo());

-- templates_mensagem: leitura para todos ativos, escrita só dona
drop policy if exists templates_select on templates_mensagem;
create policy templates_select on templates_mensagem for select
  using (is_usuario_ativo());

drop policy if exists templates_insert on templates_mensagem;
create policy templates_insert on templates_mensagem for insert with check (is_dona());
drop policy if exists templates_update on templates_mensagem;
create policy templates_update on templates_mensagem for update using (is_dona());
drop policy if exists templates_delete on templates_mensagem;
create policy templates_delete on templates_mensagem for delete using (is_dona());

-- campanhas: só dona
drop policy if exists campanhas_all on campanhas;
create policy campanhas_select on campanhas for select using (is_dona());
create policy campanhas_insert on campanhas for insert with check (is_dona());
create policy campanhas_update on campanhas for update using (is_dona());
create policy campanhas_delete on campanhas for delete using (is_dona());

-- vendas_log: só dona (dashboard)
drop policy if exists vendas_log_select on vendas_log;
create policy vendas_log_select on vendas_log for select using (is_dona());
drop policy if exists vendas_log_insert on vendas_log;
create policy vendas_log_insert on vendas_log for insert with check (is_dona());

-- configuracoes: só dona
drop policy if exists configuracoes_all_select on configuracoes;
create policy configuracoes_select on configuracoes for select using (is_dona());
create policy configuracoes_insert on configuracoes for insert with check (is_dona());
create policy configuracoes_update on configuracoes for update using (is_dona());

-- login_tentativas: só dona lê; ninguém escreve via client (só service role, usado pelo backend)
drop policy if exists login_tentativas_select on login_tentativas;
create policy login_tentativas_select on login_tentativas for select using (is_dona());

-- audit_log: só dona lê (auditoria); qualquer usuário ativo registra as próprias ações
drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log for select using (is_dona());
drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log for insert
  with check (is_usuario_ativo() and (usuario_id = auth.uid() or usuario_id is null));

-- ============================================================================
-- Realtime (pedidos, mensagens e conversas precisam de updates em tempo real)
-- ============================================================================

alter publication supabase_realtime add table pedidos;
alter publication supabase_realtime add table mensagens;
alter publication supabase_realtime add table conversas;

-- ============================================================================
-- Seed inicial de configurações (opcional)
-- ============================================================================

insert into configuracoes (chave, valor, tipo) values
  ('farmacia_nome', 'Farmácia Preço Bom', 'string'),
  ('farmacia_telefone', '', 'string'),
  ('farmacia_horario', 'Seg a Sáb, 08h às 20h', 'string'),
  ('integracao_uaizap_url', '', 'string'),
  ('integracao_n8n_url', '', 'string'),
  ('integracao_n8n_chat_webhook_url', '', 'string'),
  ('integracao_n8n_campanha_webhook_url', '', 'string')
on conflict (chave) do nothing;
