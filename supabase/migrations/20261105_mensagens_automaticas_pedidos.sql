-- ============================================================================
-- Fluxo mestre de mensagens de pedidos e encomendas
--
-- 1. `mensagens_automaticas` — os textos que o SISTEMA manda sozinho, num
--    lugar só, editáveis pela dona no painel (Operações → Mensagens
--    automáticas) sem mexer no código. Cada texto tem variáveis ({primeiro_nome},
--    {numero_pedido}, {produto}...) validadas antes de salvar.
-- 2. `pedido_notificacoes` — "recibo" de cada aviso: (pedido, evento) é único,
--    então o mesmo evento nunca gera duas mensagens, mesmo com clique duplo,
--    quadro aberto em duas telas ou o cartão indo e voltando de coluna.
-- 3. Chave `notificacoes_pedido_ativas` (padrão DESLIGADA): nada é enviado a
--    cliente até a dona ligar no painel.
--
-- Os avisos só saem de eventos CONFIRMADOS pelo sistema (a equipe moveu o
-- cartão no quadro de Pedidos / marcou a encomenda como "chegou"). Nunca por
-- status presumido. Não existe evento de "pagamento confirmado" nem de
-- "cancelado" no sistema hoje — por isso não há mensagem para eles.
--
-- Só ADICIONA coisas. Pode rodar mais de uma vez sem erro (os textos padrão
-- só entram se ainda não existirem — edições da dona são preservadas).
-- ============================================================================

create table if not exists mensagens_automaticas (
  chave text primary key,
  titulo text not null,
  descricao text,
  conteudo text not null check (char_length(conteudo) between 1 and 1500),
  ativo boolean not null default true,
  atualizado_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table mensagens_automaticas is
  'Textos enviados automaticamente pelo sistema (pedidos/encomendas). Editáveis no painel; variáveis entre chaves.';

drop trigger if exists trg_mensagens_automaticas_atualizado_em on mensagens_automaticas;
create trigger trg_mensagens_automaticas_atualizado_em before update on mensagens_automaticas
  for each row execute function set_atualizado_em();

insert into mensagens_automaticas (chave, titulo, descricao, conteudo, ativo) values
  ('pedido_recebido', 'Pedido recebido',
   'Quando o pedido entra no quadro. Desligado por padrão: a Vitória já confirma o pedido na conversa.',
   E'✅ *Pedido recebido!*\n\nOlá, {primeiro_nome}! 💚\nRecebemos seu pedido #{numero_pedido}. Nossa equipe já está conferindo tudo e logo te damos notícias por aqui. 🛍️',
   false),
  ('pedido_separando', 'Pedido em separação',
   'Quando o cartão vai para "Separando".',
   E'📦 *Seu pedido está sendo preparado!*\n\nBoa notícia, {primeiro_nome}! 💚\nEstamos separando os itens do pedido #{numero_pedido} com todo cuidado. Assim que estiver pronto, avisamos por aqui. 😊',
   true),
  ('pedido_pronto_entrega', 'Pedido pronto (entrega)',
   'Quando o cartão vai para "Pronto" e o pedido tem endereço de entrega.',
   E'🛵 *Pedido pronto!*\n\n{primeiro_nome}, seu pedido #{numero_pedido} já está pronto e sai para entrega em instantes. 📍 Fique de olho no recebimento! 💚',
   true),
  ('pedido_pronto_retirada', 'Pedido pronto (retirada)',
   'Quando o cartão vai para "Pronto" e o pedido NÃO tem endereço (retirada na loja).',
   E'🛍️ *Pedido pronto para retirada!*\n\n{primeiro_nome}, seu pedido #{numero_pedido} já está separado esperando por você aqui na {farmacia}. É só passar no balcão! 💚',
   true),
  ('pedido_entregue', 'Pedido entregue / finalizado',
   'Quando o cartão vai para "Finalizados hoje".',
   E'🎉 *Pedido finalizado!*\n\n{primeiro_nome}, seu pedido #{numero_pedido} foi entregue. Obrigado pela preferência! Precisando, é só chamar por aqui. 😊💚',
   true),
  ('encomenda_chegou', 'Encomenda chegou',
   'Quando a encomenda vai para "Chegou". Este aviso já existia — agora o texto pode ser editado.',
   E'📦 *Sua encomenda chegou!*\n\nOlá, {primeiro_nome}! 💚\n{produto}{quantidade} já está aqui na {farmacia} esperando por você. É só passar no balcão para retirar. 😊',
   true)
on conflict (chave) do nothing;

create table if not exists pedido_notificacoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references pedidos(id) on delete cascade,
  encomenda_id uuid references encomendas(id) on delete cascade,
  evento text not null,
  status text not null default 'reservada' check (status in ('reservada', 'enviada', 'falhou', 'ignorada')),
  mensagem_id uuid references mensagens(id) on delete set null,
  motivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((pedido_id is not null) <> (encomenda_id is not null))
);

comment on table pedido_notificacoes is
  'Um registro por (pedido|encomenda, evento): garante que cada aviso automático sai no máximo uma vez.';

create unique index if not exists idx_pedido_notificacoes_pedido_evento on pedido_notificacoes (pedido_id, evento) where pedido_id is not null;
create unique index if not exists idx_pedido_notificacoes_encomenda_evento on pedido_notificacoes (encomenda_id, evento) where encomenda_id is not null;
create index if not exists idx_pedido_notificacoes_criado_em on pedido_notificacoes (criado_em desc);

drop trigger if exists trg_pedido_notificacoes_atualizado_em on pedido_notificacoes;
create trigger trg_pedido_notificacoes_atualizado_em before update on pedido_notificacoes
  for each row execute function set_atualizado_em();

insert into configuracoes (chave, valor, tipo) values ('notificacoes_pedido_ativas', 'false', 'boolean')
on conflict (chave) do nothing;

alter table mensagens_automaticas enable row level security;
alter table pedido_notificacoes enable row level security;

drop policy if exists mensagens_automaticas_select on mensagens_automaticas;
create policy mensagens_automaticas_select on mensagens_automaticas for select using (is_usuario_ativo());
drop policy if exists mensagens_automaticas_update on mensagens_automaticas;
create policy mensagens_automaticas_update on mensagens_automaticas for update using (is_dona());

drop policy if exists pedido_notificacoes_select on pedido_notificacoes;
create policy pedido_notificacoes_select on pedido_notificacoes for select using (is_usuario_ativo());
-- Escrita só pelo servidor (service role), que faz a reserva antes de enviar.
