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
- `POST /api/webhooks/mensagem` — registra no Chat ao vivo cada mensagem trocada no WhatsApp/Instagram (do cliente ou da IA), criando cliente/conversa se necessário
- `GET /api/templates` — lista os templates de mensagem cadastrados
- `POST /api/campanhas/:id/status` — confirma o envio (ou outro status) de uma campanha

### Chat ao vivo (CRM → N8N)

Quando uma funcionária/dona responde pelo Chat ao vivo, o painel chama `POST /api/chat/enviar` (autenticado por sessão, não pelo token do N8N). Essa rota salva a mensagem no Supabase e, em seguida, notifica o N8N via a URL configurada em **Configurações → Integrações → Webhook do N8N para enviar mensagens do chat** (chave `integracao_n8n_chat_webhook_url`), enviando `Authorization: Bearer <N8N_WEBHOOK_SECRET>` para o N8N validar a origem. Cabe ao workflow do N8N entregar essa mensagem via UAIZAP/WhatsApp.

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

Nenhum sistema é 100% imune a ataques, mas as camadas abaixo cobrem as classes de risco mais comuns pra uma aplicação web deste tipo (painel interno com dados de clientes e integrações externas). Se encontrar algo que pareça uma brecha, priorize corrigir antes de expandir funcionalidades.

### Autenticação e controle de acesso

- Autenticação via Supabase Auth (hash de senha com bcrypt, gerenciado pelo Supabase — nenhuma senha é manipulada em texto puro pelo nosso código)
- **Row Level Security (RLS) em todas as tabelas** — a autorização é garantida pelo próprio Postgres, não só pela UI: mesmo uma requisição direta à API do Supabase com a `anon key` respeita as mesmas regras (funcionária não lê `campanhas`/`configuracoes`/`vendas_log`, dona vê tudo). Ver `supabase/schema.sql`.
- Funções `is_dona()` / `is_usuario_ativo()` / `auth_role()` são `SECURITY DEFINER` — evitam recursão nas policies e centralizam a lógica de permissão num único lugar auditável.
- Sessões geridas via cookies HttpOnly do Supabase Auth (`@supabase/ssr`), refresh automático no middleware.
- Todas as páginas fazem dupla checagem de sessão: além do middleware, cada rota chama `requireUser()`/`requireDona()` (`src/lib/auth.ts`) — se uma nunca rodar, a outra ainda barra o acesso.
- Contas desativadas (`usuarios.ativo = false`) perdem acesso imediatamente, mesmo com sessão ainda válida (checado em toda leitura de usuário).
- Tentativas de login (sucesso/falha, IP) registradas em `login_tentativas`, e cada ação sensível (criar/desativar usuário, editar configurações, disparar campanha, etc.) fica no `audit_log` com autor, ação, entidade e timestamp — visível pra dona em Configurações → Atividade.

### Headers HTTP e política de conteúdo (CSP)

Aplicados a toda resposta via middleware (`src/lib/supabase/middleware.ts`, função `applySecurityHeaders`):

| Header | Valor | Protege contra |
|---|---|---|
| `Content-Security-Policy` | `script-src 'self' 'nonce-<aleatório por requisição>' 'strict-dynamic'`, sem `unsafe-inline`/`unsafe-eval` para scripts | Injeção de script (XSS) — mesmo que um atacante consiga injetar HTML/texto em algum campo, um `<script>` malicioso não executa sem o nonce da requisição, que é imprevisível e trocado a cada acesso |
| `X-Frame-Options: DENY` + `frame-ancestors 'none'` | — | Clickjacking (site sendo carregado num `<iframe>` invisível em outro domínio) |
| `X-Content-Type-Options: nosniff` | — | Ataques de MIME-sniffing (navegador "adivinhar" um tipo de arquivo perigoso) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Downgrade de HTTPS pra HTTP (o navegador passa a exigir HTTPS por 2 anos, mesmo se alguém tentar interceptar) |
| `Referrer-Policy: strict-origin-when-cross-origin` | — | Vazamento de URLs internas (ex: `/pedidos?...`) pro cabeçalho `Referer` de sites de terceiros |
| `Permissions-Policy` | câmera, microfone e geolocalização desativados | Uso indevido de APIs do navegador que o painel não usa |

**Importante sobre a CSP:** o nonce é gerado por requisição no middleware e precisa bater com o nonce embutido no HTML — por isso o layout raiz (`src/app/layout.tsx`) e a página de login (`src/app/auth/login/page.tsx`) são forçados a renderizar dinamicamente (`export const dynamic = "force-dynamic"` / uso de `headers()`), não estaticamente. Se algum dia adicionar um novo `<script>` inline (analytics, um widget de terceiro, etc.), ele **vai ser bloqueado silenciosamente pelo navegador** a menos que receba esse mesmo nonce — teste sempre no console do navegador (aba Console, filtrar por "Content Security Policy") depois de mudanças assim.

**⚠️ Sobre o `middleware.ts`:** como o projeto usa a pasta `src/`, o arquivo de middleware **precisa** estar em `src/middleware.ts` (não na raiz do projeto) — caso contrário o Next.js o ignora silenciosamente, sem erro nenhum no build. Isso já aconteceu neste projeto (o arquivo estava na raiz) e foi corrigido; se algum dia o middleware "parar de funcionar" sem motivo aparente, confira a localização do arquivo primeiro.

### Webhooks (N8N → CRM)

- Toda rota `/api/webhooks/*` (e `/api/campanhas/:id/status`) exige `Authorization: Bearer <N8N_WEBHOOK_SECRET>` — sem o token exato, a rota responde 401 antes de tocar no banco (`src/lib/webhook-auth.ts`).
- Rate limiting por IP + rota (padrão 60 req/min, 240 req/min nas rotas de chat) — evita abuso ou um workflow com bug em loop infinito de chamadas.
- Todo payload é validado com Zod (`src/lib/validation.ts`) antes de tocar no banco — nada de campo inesperado ou tipo errado vira SQL/lógica de negócio.
- Consultas ao banco usam o client do Supabase (`postgrest-js`), que sempre parametriza os valores — não há concatenação de SQL em lugar nenhum do código, então injeção de SQL não é uma superfície de ataque válida aqui.

### Dados sensíveis

- Telefones mascarados na interface por padrão (`lib/utils.ts#maskPhone`) — só os últimos 4 dígitos aparecem na lista.
- `SUPABASE_SERVICE_ROLE_KEY` (acesso total, ignora RLS) só é usada em código server-side (webhooks, admin de usuários) — nunca é enviada ao browser. Confirme isso sempre que adicionar uma env var nova: se não começa com `NEXT_PUBLIC_`, ela nunca deve aparecer num Client Component.

### Limitações conhecidas (não resolvidas ainda)

Pra manter esta seção honesta — nenhuma dessas é uma vulnerabilidade explorável hoje, mas são pontos de atenção pra quando o negócio crescer:

- **Rate limiting em memória** (`src/lib/rate-limit.ts`) — funciona bem numa instância só; reseta a cada redeploy/restart e não é compartilhado se um dia houver mais de uma instância rodando. Pra escalar, trocar por um store compartilhado (Redis/Upstash).
- **Sem fluxo de "esqueci minha senha"** — hoje a redefinição de senha só é possível manualmente pelo Supabase.
- **Sem 2FA** — login é só e-mail + senha.
- **Sessão sem expiração customizada** — usa o padrão do Supabase Auth (renovação automática enquanto o usuário estiver ativo).
