# CRM Farmácia Preço Bom

Painel web para gerenciar o atendimento automatizado da farmácia via WhatsApp/Instagram (UAIZAP + N8N + IA), pedidos, chat ao vivo, clientes, campanhas e templates de mensagem.

**Stack:** Next.js 14 (App Router) · Tailwind CSS · Supabase (Auth + Postgres + RLS + Realtime) · Recharts

## Setup

```bash
npm install
cp .env.example .env.local
```

Preencha `.env.local` com as credenciais do seu projeto Supabase e o token secreto dos webhooks.

## Banco de dados

No SQL editor do Supabase, rode nesta ordem:

1. `supabase/schema.sql` — tabelas, enums, índices, RLS e realtime
2. `supabase/seed.sql` — dados de exemplo (opcional, útil pra testar o painel)

Depois crie o primeiro usuário **dona**:

1. Crie o usuário em Authentication → Users (email + senha) no painel do Supabase, ou via `supabase.auth.admin.createUser`.
2. Insira o registro correspondente na tabela `usuarios` com o mesmo `id` do usuário criado, `role = 'dona'`.

A partir daí, a dona pode criar as demais contas (funcionárias) pela tela **Configurações**.

## Rodando localmente

```bash
npm run dev
```

## Variáveis de ambiente

Veja `.env.example`. Resumo:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client público (browser + SSR)
- `SUPABASE_SERVICE_ROLE_KEY` — só usado no servidor (webhooks e administração de usuários), nunca exposto ao browser
- `N8N_WEBHOOK_SECRET` — token que o N8N deve enviar em `Authorization: Bearer <token>` nos webhooks
- `N8N_BASE_URL`, `UAIZAP_API_KEY`, `UAIZAP_BASE_URL` — configuração das integrações

## Webhooks / API para o N8N

Todas as rotas abaixo exigem o header `Authorization: Bearer <N8N_WEBHOOK_SECRET>` e têm rate limiting.

- `POST /api/webhooks/pedido` — cria pedido (e cliente/produtos se necessário) quando uma venda é confirmada pela IA
- `POST /api/webhooks/cliente` — cria ou atualiza um cliente a partir de uma nova interação
- `GET /api/templates` — lista os templates de mensagem cadastrados
- `POST /api/campanhas/:id/status` — confirma o envio (ou outro status) de uma campanha

## Estrutura

```
src/
  app/
    auth/login/            # login (Supabase Auth)
    (app)/                 # área autenticada (sidebar + header)
      dashboard/            # métricas (só dona)
      pedidos/              # fila de separação
      chat/                 # chat ao vivo com a IA/cliente
      clientes/             # cadastro e observações
      campanhas/            # campanhas de mensagens (só dona)
      templates/            # templates de resposta
      configuracoes/        # dados da farmácia, usuários, segurança (só dona)
    api/                    # webhooks e endpoints consumidos pelo N8N
  components/               # componentes de UI e por domínio
  lib/                      # supabase clients, auth, validação, rate limit
  types/                    # tipos do banco (Database) e relações
supabase/
  schema.sql                # schema + RLS + realtime
  seed.sql                  # dados de exemplo
```

## Segurança

- Autenticação via Supabase Auth (hash de senha automático)
- RLS em todas as tabelas — funcionárias não acessam dashboard/campanhas/configurações, mesmo por API
- Rotas de webhook exigem token secreto e têm rate limiting
- Telefones mascarados na interface (`lib/utils.ts#maskPhone`)
- Tentativas de login (sucesso/falha) registradas em `login_tentativas`
- Chaves de serviço (`SUPABASE_SERVICE_ROLE_KEY`) usadas apenas em código server-side
