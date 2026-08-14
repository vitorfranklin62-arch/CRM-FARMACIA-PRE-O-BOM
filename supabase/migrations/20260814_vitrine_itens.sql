-- Cria a tabela vitrine_itens: promoções/itens exibidos no site público
-- (farmaciaprecobom.com.br). O site lê essa tabela direto do Supabase com a
-- chave anon (só os itens ativos, via RLS), sem passar pelo CRM.
-- Seguro de rodar — só cria o que ainda não existe.

create table if not exists vitrine_itens (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  tag text,
  preco decimal(10, 2) not null,
  imagem_url text,
  video_url text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_vitrine_itens_ordem on vitrine_itens(ordem);

drop trigger if exists trg_vitrine_itens_atualizado_em on vitrine_itens;
create trigger trg_vitrine_itens_atualizado_em before update on vitrine_itens
  for each row execute function set_atualizado_em();

alter table vitrine_itens enable row level security;

drop policy if exists vitrine_itens_select_publico on vitrine_itens;
create policy vitrine_itens_select_publico on vitrine_itens for select
  using (ativo = true);

drop policy if exists vitrine_itens_select_equipe on vitrine_itens;
create policy vitrine_itens_select_equipe on vitrine_itens for select
  using (is_usuario_ativo());

drop policy if exists vitrine_itens_write on vitrine_itens;
create policy vitrine_itens_write on vitrine_itens for insert with check (is_dona());
drop policy if exists vitrine_itens_update on vitrine_itens;
create policy vitrine_itens_update on vitrine_itens for update using (is_dona());
drop policy if exists vitrine_itens_delete on vitrine_itens;
create policy vitrine_itens_delete on vitrine_itens for delete using (is_dona());
