# CRM Farmácia Preço Bom

Painel web para gerenciar o atendimento automatizado da farmácia via WhatsApp/Instagram (UAIZAP + N8N + IA), pedidos, chat ao vivo, clientes, campanhas e templates de mensagem.

**Stack:** Next.js 14 (App Router) · Tailwind CSS · Supabase (Auth + Postgres + RLS + Realtime) · Recharts

## Setup

```bash
npm install
cp .env.example .env.local
```

Preencha `.env.local` com as credenciais do seu projeto Supabase e o token secreto dos webhooks.

## Instalar como app (PWA)

O painel é um Progressive Web App — dá pra "instalar" ele no computador ou no celular, ganhando um ícone próprio e abrindo numa janela separada, sem barra de endereço do navegador (como um app nativo). Continua sendo o mesmo site, só que com atalho direto; precisa de internet pra funcionar (não é um app offline).

**Windows/Mac/Linux (Chrome ou Edge):**
1. Abra o painel no navegador.
2. Clique no ícone de instalação que aparece na barra de endereço (perto do favorito ⭐), ou no menu **⋮ → Instalar Preço Bom / Instalar aplicativo**.
3. Confirma. Um atalho aparece na área de trabalho / menu iniciar, abrindo numa janela própria.

**Android (Chrome):**
1. Abra o painel no Chrome.
2. Toque no menu **⋮ → Adicionar à tela inicial** (ou vai aparecer um banner automático oferecendo instalar).
3. Confirma. Ícone aparece na tela inicial como um app normal.

**iPhone/iPad (Safari):**
- O iOS não mostra um botão de "instalar" automático — precisa ser manual:
1. Abra o painel no **Safari** (não funciona pelo Chrome no iOS).
2. Toque no ícone de compartilhar (quadrado com seta pra cima).
3. Toque em **"Adicionar à Tela de Início"**.
4. Confirma. Ícone aparece na tela inicial, abre em tela cheia sem a barra do Safari.

### Detalhes técnicos

- `src/app/manifest.ts` — gera o Web App Manifest (`/manifest.webmanifest`) com nome, ícones e cor do tema.
- `public/sw.js` — service worker mínimo, só pra habilitar a instalação. **Não faz cache de páginas** — o painel depende de dados ao vivo do Supabase, e cada página é servida com um nonce de segurança (CSP) novo a cada acesso; um service worker "normal" que guarda páginas em cache serviria HTML com nonce desatualizado e quebraria o app. Por isso o app só funciona online.
- Ícones em `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `apple-touch-icon.png`.
- Tanto o manifest quanto o `sw.js` precisam ficar acessíveis **sem estar logado** (o navegador verifica isso antes mesmo do usuário abrir o app) — por isso estão na lista de exceções do middleware de autenticação (`src/middleware.ts`).

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

### Cálculo de taxa de entrega (IA)

Em **Configurações → Bairros de entrega**, a dona cadastra os bairros atendidos e o valor de entrega de cada um. A IA usa isso pra calcular a entrega quando o cliente pede pra receber em casa, através de uma function/tool no N8N que chama a função `calcular_taxa_entrega` do Supabase via RPC (mesmo padrão do `buscar_produtos`, já usado pra consultar o catálogo):

```
POST {SUPABASE_URL}/rest/v1/rpc/calcular_taxa_entrega
Headers: apikey / Authorization igual às outras chamadas RPC já configuradas no N8N
Body: { "bairro_busca": "<bairro que o cliente informou>" }
```

Devolve `[{ "bairro": "...", "valor": 8.00 }]` se achar um bairro correspondente (a comparação ignora acento/maiúsculas/espaços), ou uma lista vazia `[]` se a farmácia não entrega nesse bairro — nesse caso a IA deve avisar o cliente e oferecer retirada na loja.

Ao criar o pedido (`POST /api/webhooks/pedido`), o payload aceita opcionalmente `taxa_entrega` (número) e `forma_pagamento` (texto livre, ex.: "Pix", "Cartão", "Dinheiro") — se `total` não vier explícito, ele é calculado como soma dos itens + `taxa_entrega`.

## Importação de estoque

Em **Produtos → Importar estoque**, a dona pode subir o relatório de inventário exportado pelo sistema da farmácia pra atualizar custo e quantidade em estoque de uma vez, sem precisar cadastrar produto por produto. Dois formatos de arquivo são aceitos, detectados automaticamente pela extensão.

### Formato 1: `.fp3` / `.xml` ("Livro Registro de Inventário")

Não é um PDF de verdade — é um XML de "relatório preparado" (formato usado por sistemas de gestão de farmácia baseados em FastReport). Cada produto aparece como um bloco `<b1 t="...">...</b1>` com campos numerados `<dN u="valor"/>`. O parser (`src/lib/estoque-import.ts`) usa este mapeamento, validado manualmente contra um arquivo real (custo unitário × quantidade bate com o "Custo Total" impresso no relatório em várias linhas conferidas):

| Campo no arquivo | Significado | Vai para |
|---|---|---|
| `d1` | Nome do produto | `produtos.nome` |
| `d4` | Laboratório | `produtos.laboratorio` |
| `d11` | Custo unitário | `produtos.custo` |
| `d13` | Quantidade em estoque | `produtos.estoque` |
| `d16` | Código interno do produto no sistema da farmácia | `produtos.sku` |

Números vêm no formato brasileiro (`1.234,56`) e são convertidos automaticamente. O sufixo `" sem dados"` que aparece colado em alguns nomes de produto (defeito da exportação do sistema de origem) é removido automaticamente.

**Casa produtos pelo código interno (`sku`).** Se o código já existe no catálogo, atualiza nome/laboratório/custo/estoque. Se não existe, cria um produto novo com `preco = custo` (valor inicial, só pra não ficar zerado — aparece com o selo **"Revisar preço"** até a dona ajustar).

### Formato 2: `.pdf` (relatório "Nome do Produto / Apresentação / Laboratório / Cla / Qtde / Custo / Total Custo / Venda / Total Venda")

Esse relatório vem de outro sistema de gestão de farmácia e é um PDF de verdade, mas com um bug de geração: quando o nome do produto ocupa 2 linhas, a 2ª linha é desenhada na mesma altura da linha seguinte da tabela em vez de aumentar a altura da linha — então não dá pra reconstruir as linhas simplesmente agrupando por coordenada Y. O parser (`src/lib/estoque-pdf-import.ts`, usando `pdfjs-dist` para extrair texto com posição) caminha pelos itens de texto na ordem em que o PDF os desenha (que segue sempre "nome do produto, em 1 ou 2 linhas" → "resto das colunas daquela linha") e reconstrói cada linha por esse padrão, não pela posição vertical.

Esse formato **não tem código/SKU de produto**, então a importação casa por **nome normalizado** (sem acento, maiúsculas/minúsculas e espaços). Diferente do `.fp3`, esse relatório traz o preço de venda real (coluna "Venda") — **por isso esse formato também atualiza o preço de produtos já existentes** (não só dos novos), sempre que a linha do PDF tiver uma venda válida (> 0); nas raras linhas sem venda, o preço já cadastrado não é tocado.

Cada linha reconstruída é conferida por aritmética antes de ser aceita (`quantidade × custo ≈ Total Custo` e `quantidade × venda ≈ Total Venda`, com tolerância de 2 centavos) — numa amostra real, ~3,5% das linhas não bateram (nomes colados em cascata quando 2+ produtos seguidos têm nome de 2 linhas) e foram automaticamente deixadas de fora da importação; as páginas do PDF com essas linhas voltam na resposta (`paginasParaRevisar`) pra dona conferir manualmente.

### O que a importação faz (e o que NÃO faz)

- **Nunca apaga nada.** Produtos que estão no catálogo mas não vieram no arquivo continuam exatamente como estavam.
- **`.fp3`: nunca sobrescreve o preço de venda de um produto que já existe** — só laboratório, custo e estoque são atualizados; sem preço de venda nesse formato, o preço é sempre ajustado manualmente pela dona.
- **`.pdf`: atualiza o preço de produtos já existentes com o valor real da coluna "Venda"** do relatório (quando essa linha tiver uma venda válida) — esse formato traz preço de venda de verdade, então é tratado como fonte confiável pra reajuste de preço em massa.

### Rota

`POST /api/produtos/importar-estoque` — autenticada por sessão, só a dona pode chamar. Recebe o arquivo via `multipart/form-data` (campo `file`), processa em lotes de 500 linhas e devolve um resumo (`total`, `criados`, `atualizados`, `erros`, `ignoradas`, e `paginasParaRevisar` no caso do PDF). Cada importação fica registrada em Configurações → Atividade.

### Limpar produtos duplicados

Como o `.pdf` casa produtos pelo nome (sem código/SKU), qualquer importação feita antes de uma correção no parser pode ter deixado produtos duplicados no catálogo (o mesmo produto cadastrado 2x, com preço/estoque diferentes entre as cópias). Em **Produtos → Limpar duplicados**, a dona vê uma prévia de quantos grupos duplicados existem antes de confirmar a remoção — mantém sempre a linha mais recentemente atualizada de cada nome e remove as outras. Produtos já usados em algum pedido nunca são removidos (o banco tem uma trava de chave estrangeira pra isso — `pedido_itens.produto_id references produtos(id)`). Rota: `GET /api/produtos/duplicados` (prévia, só leitura) e `POST /api/produtos/duplicados` (executa), ambas só a dona.

## Site público (landing)

A página em `/` (`src/app/page.tsx`) é o site público institucional da farmácia
— cartão de visitas digital pro link da bio do Instagram e do Perfil da
Empresa no Google. Não tem checkout: toda conversão termina no WhatsApp. Vive
no mesmo app Next.js do CRM (mesmo deploy, mesmo projeto Supabase), mas em
rotas completamente separadas e sem autenticação:

- `/` — landing pública (header, hero, promoções, busca, serviços, como
  comprar, onde estamos, rodapé, botão flutuante de WhatsApp no mobile)
- `/assets/site/{icon,apple-icon,og-image}` — favicon, ícone iOS e imagem de
  compartilhamento, gerados dinamicamente (`next/og`) a partir de uma
  recriação em SVG do logo — troque pelos arquivos oficiais (`favicon-512.png`,
  `apple-icon-180.png`, `og-image.png`) quando disponíveis, apontando
  `icons`/`openGraph.images` em `src/app/page.tsx` pra eles
- `/api/site/evento` — telemetria anônima (clique WhatsApp/iFood, busca)
- `/api/revalidate` — o CRM chama isso (`Authorization: Bearer <REVALIDATE_SECRET>`)
  quando uma promoção muda, pra atualizar a home antes dos 5 minutos de cache

Todo dado do negócio (endereço, horário, WhatsApp, Instagram, iFood, CNPJ,
farmacêutico responsável) vem de `src/config/loja.ts` — nenhum componente tem
esses valores hardcoded.

### SQL a rodar no Supabase do CRM

O bloco "SITE PÚBLICO" no final de `supabase/schema.sql` (adiciona colunas em
`produtos`, cria `site_eventos`, o bucket de Storage `produtos-imagens` e as
políticas de RLS de leitura anônima/upload de foto) — rode uma vez no SQL
editor do Supabase, depois do schema principal. É idempotente, pode rodar de
novo sem quebrar nada.

### Como atualizar o site (sem programar)

Todo o conteúdo do site — promoções, fotos, produto entrando ou saindo da
vitrine — é editado pela dona **dentro do próprio CRM**, na tela
**Produtos**, sem precisar mexer em código nem pedir nada pra mim depois
que estiver no ar:

1. Abra o produto (ou crie um novo) e marque **"Mostrar na vitrine do
   site"**.
2. Escolha a **categoria** (obrigatória) e, se quiser, o **princípio
   ativo**.
3. Clique em **"Enviar foto"** pra subir a imagem do produto — ela vai pro
   Storage do Supabase (bucket `produtos-imagens`) e o link já fica salvo
   sozinho. Sem foto, o card mostra um ícone genérico.
4. Pra colocar em promoção, preencha **preço promocional** e **promoção
   até** (a etiqueta com desconto some sozinha depois dessa data).
5. Salvar já **atualiza a home do site na hora** (chama
   `revalidarSitePublico()`, que limpa o cache de 5 min imediatamente) —
   não precisa esperar nem publicar nada separado.

Produtos com **"Exige receita médica"** marcado nunca aparecem na vitrine
(trava tanto na tela quanto na política de leitura do banco), por exigência
sanitária. O badge **"Na vitrine"** ao lado do nome, na lista de produtos,
mostra rapidamente o que já está publicado no site.

### Cache e fallback

A busca de destaques (`src/lib/produtos-destaque.ts`) é cacheada por 5 minutos
(`unstable_cache`, tag `produtos-destaque`). Se o Supabase falhar ou devolver
vazio, a home cai automaticamente pra `src/data/promocoes-fallback.json` (8
produtos de exemplo) — o site nunca aparece quebrado ou vazio pro cliente.

### Pendências antes de publicar

- **WhatsApp, Instagram, iFood, domínio, CNPJ e farmacêutico responsável** —
  hoje com placeholder em `src/config/loja.ts` (e `.env`/EasyPanel pras
  variáveis `NEXT_PUBLIC_WHATSAPP_NUMERO`, `NEXT_PUBLIC_IFOOD_URL`,
  `NEXT_PUBLIC_SITE_URL`). Marcados com `// TODO: preencher` no arquivo.
- **Fotos dos produtos** — sem foto, o card mostra um ícone de comprimido no
  lugar; a dona sobe a foto direto pela tela **Produtos** do CRM (veja
  "Como atualizar o site" acima), não precisa mexer no banco.
- **Latitude/longitude reais** da loja em `loja.endereco.geo` (JSON-LD) —
  hoje é uma aproximação do centro de Salvador.
- **Logo/ícones oficiais** — a versão atual (`/assets/site/*`) é uma
  recriação simplificada em SVG das cores e formas da marca, não os arquivos
  originais.

### Deploy no EasyPanel

1. Crie um app do tipo **Dockerfile** apontando pra este repositório/branch —
   o `Dockerfile` na raiz já faz o build multi-stage (`output: "standalone"`).
2. Configure as variáveis de ambiente do app (mesmas do `.env.example`),
   incluindo as `NEXT_PUBLIC_*` do site — elas precisam estar disponíveis
   **no momento do build** (ficam embutidas no bundle do browser), então
   passe-as também como *build args* se o EasyPanel pedir.
3. Porta do container: `3000` (já exposta no `Dockerfile`).
4. Aponte o domínio (`precobom.com.br`) pro app no EasyPanel e emita o
   certificado TLS por lá (Let's Encrypt automático).
5. Depois do primeiro deploy, teste `/`, `/robots.txt` e `/sitemap.xml` sem
   estar logado — todos devem carregar normalmente (são rotas públicas).

## Estrutura

```
src/
  app/
    page.tsx                # landing pública do site (rota "/", sem login)
    assets/site/             # favicon/apple-icon/og-image gerados dinamicamente
    auth/login/            # login (Supabase Auth)
    (app)/                 # área autenticada (sidebar + header)
      dashboard/            # métricas (só dona)
      pedidos/              # fila de separação
      chat/                 # chat ao vivo com a IA/cliente
      clientes/             # cadastro e observações
      campanhas/            # campanhas de mensagens (só dona)
      templates/            # templates de resposta
      configuracoes/        # dados da farmácia, usuários, segurança (só dona)
    api/                    # webhooks, telemetria e revalidação do site
  components/
    site/                   # seções e componentes do site público
  config/loja.ts            # dados reais do negócio (site), fonte única
  data/promocoes-fallback.json  # catálogo de fallback do site
  lib/                      # supabase clients, auth, validação, rate limit, whatsapp
  types/                    # tipos do banco (Database) e relações
supabase/
  schema.sql                # schema do CRM + bloco "SITE PÚBLICO" no final
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
