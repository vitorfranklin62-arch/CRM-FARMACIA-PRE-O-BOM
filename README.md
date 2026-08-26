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
- `OPENAI_API_KEY` — usada só pelo widget flutuante interno **Vitória AI**, nunca pela IA que atende cliente
- `OPENAI_MODEL` — opcional; modelo usado pela Vitória AI (padrão `gpt-4o`). Serve pra trocar de modelo sem mexer no código

## Webhooks / API para o N8N

Todas as rotas abaixo exigem o header `Authorization: Bearer <N8N_WEBHOOK_SECRET>` e têm rate limiting.

- `POST /api/webhooks/pedido` — cria pedido (e cliente/produtos se necessário) quando uma venda é confirmada pela IA
- `POST /api/webhooks/cliente` — cria ou atualiza um cliente a partir de uma nova interação
- `POST /api/webhooks/mensagem` — registra no Chat ao vivo cada mensagem trocada no WhatsApp/Instagram (do cliente ou da IA), criando cliente/conversa se necessário
- `GET /api/templates` — lista os templates de mensagem cadastrados
- `POST /api/campanhas/:id/status` — confirma o envio (ou outro status) de uma campanha

### Chat ao vivo (CRM → N8N)

Quando uma funcionária/dona responde pelo Chat ao vivo, o painel chama `POST /api/chat/enviar` (autenticado por sessão, não pelo token do N8N). Essa rota salva a mensagem no Supabase e, em seguida, notifica o N8N via a URL configurada em **Configurações → Integrações → Webhook do N8N para enviar mensagens do chat** (chave `integracao_n8n_chat_webhook_url`), enviando `Authorization: Bearer <N8N_WEBHOOK_SECRET>` para o N8N validar a origem. Cabe ao workflow do N8N entregar essa mensagem via UAIZAP/WhatsApp.

### Foto de perfil do cliente

Os webhooks `/api/webhooks/cliente`, `/api/webhooks/mensagem` e `/api/webhooks/pedido` aceitam um campo opcional `foto_url` dentro do objeto `cliente` — uma URL de imagem (ex.: a foto de perfil do WhatsApp/Instagram) que aparece como avatar nas telas de Clientes e Chat, com fallback automático pras iniciais do nome quando não há foto (ou a URL falha ao carregar).

A geração dessa URL fica por conta do workflow do N8N: antes de chamar o webhook, adicione uma chamada à API do UAIZAP que retorna a foto de perfil do contato (o endpoint exato varia por provedor — consulte a documentação do UAIZAP) e inclua o resultado como `cliente.foto_url` no payload. Se o UAIZAP não retornar foto (perfil privado, número sem foto, etc.), simplesmente omita o campo — o cliente continua funcionando normalmente, só sem foto.

Uma chamada que **não** inclui `foto_url` nunca apaga uma foto já salva (só grava quando o campo vem preenchido) — então não tem problema alguns eventos terem a foto e outros não.

**Atenção:** URLs de foto de perfil do WhatsApp costumam expirar depois de um tempo. Como o campo é reenviado a cada novo evento (mensagem, pedido, etc.), a foto se atualiza sozinha com o uso normal — não precisa de um job separado pra manter em dia.

### Cálculo de taxa de entrega (IA)

Em **Configurações → Bairros de entrega**, a dona cadastra os bairros atendidos e o valor de entrega de cada um. A IA usa isso pra calcular a entrega quando o cliente pede pra receber em casa, através de uma function/tool no N8N que chama a função `calcular_taxa_entrega` do Supabase via RPC (mesmo padrão do `buscar_produtos`, já usado pra consultar o catálogo):

```
POST {SUPABASE_URL}/rest/v1/rpc/calcular_taxa_entrega
Headers: apikey / Authorization igual às outras chamadas RPC já configuradas no N8N
Body: { "bairro_busca": "<bairro que o cliente informou>" }
```

Devolve `[{ "bairro": "...", "valor": 8.00 }]` se achar um bairro correspondente (a comparação ignora acento/maiúsculas/espaços), ou uma lista vazia `[]` se a farmácia não entrega nesse bairro — nesse caso a IA deve avisar o cliente e oferecer retirada na loja.

Ao criar o pedido (`POST /api/webhooks/pedido`), o payload aceita opcionalmente `taxa_entrega` (número) e `forma_pagamento` (texto livre, ex.: "Pix", "Cartão", "Dinheiro") — se `total` não vier explícito, ele é calculado como soma dos itens + `taxa_entrega`.

## Encomendas

Fila separada de **Pedidos**, pra produto que a farmácia não tem em estoque e está encomendando especialmente pro cliente (fornecedor/distribuidor). Em **Encomendas**, qualquer usuária logada cadastra: nome do cliente, número, nome do produto, quantidade e observações — o cliente é resolvido pelo telefone (reaproveita se já existir, sem sobrescrever o nome já salvo; cria um novo se for a primeira vez).

Quadro com 3 colunas:

- **Aguardando chegar** (`pendente`) — acabou de ser cadastrada.
- **Chegou** (`chegou`) — ao mover pra essa coluna, o backend avisa o cliente automaticamente por WhatsApp (mensagem tipo `Sua encomenda de "X" já chegou na farmácia...`), salva essa mensagem na conversa dele (aparece no Chat ao vivo, igual a qualquer mensagem enviada pela equipe) e notifica o N8N pra entregar de fato via UAIZAP. **Não é um webhook novo** — reaproveita a mesma URL/token já configurados em Configurações → Integrações pro Chat ao vivo (`integracao_n8n_chat_webhook_url` + `N8N_WEBHOOK_SECRET`), então não precisa configurar nada além do que o Chat ao vivo já usa.
- **Retirada hoje** (`entregue`) — cliente já buscou; some do quadro no dia seguinte (mesma lógica do "Entregue hoje" em Pedidos), mas o registro continua no banco.

Uma encomenda em "Aguardando chegar" ou "Chegou" também pode ser cancelada (`cancelada`) — some do quadro, mas fica no histórico (Configurações → Atividade).

O aviso automático só dispara uma vez por encomenda (na transição pra "chegou" — mudar o status de novo não reenvia); se o N8N não estiver configurado, o status muda normalmente e só a notificação por WhatsApp é pulada. Rota: `POST /api/encomendas/:id/status`, autenticada por sessão.

## Vitória AI (widget flutuante de referência farmacêutica)

A **Vitória AI** é uma bolha flutuante (`src/components/consulta-ia/VitoriaFloatingWidget.tsx`), visível em qualquer tela do painel pra qualquer usuária logada (dona ou funcionária) — clica pra abrir um chat pequeno, pergunta coisas como "qual o genérico do Buscopan?" ou "Losartana tem contraindicação pra gestante?" e recebe uma resposta gerada pela API da OpenAI (`POST /api/consulta-farmaceutica` → `src/lib/ia.ts`, modelo definido em `OPENAI_MODEL`, padrão `gpt-4o`). Até pouco tempo essa ferramenta se chamava "ATLAS AI" — o nome mudou, o comportamento é o mesmo.

> ⚠️ **Cuidado com o nome duplicado:** essa ferramenta interna e a IA que atende cliente no WhatsApp/Instagram (a que roda no N8N) **têm o mesmo nome de persona ("Vitória") por coincidência de escolha da dona, mas são sistemas completamente separados** — não se comunicam entre si, não compartilham prompt nem histórico. Ao mexer em qualquer uma das duas, confirme se está no código certo: essa daqui é `src/lib/ia.ts` / `POST /api/consulta-farmaceutica` (widget interno); a outra vive inteira no N8N (fora deste repositório).

Pontos importantes sobre essa ferramenta:

- **É uma ferramenta interna** — ninguém de fora da equipe logada no painel tem acesso a esse widget.
- **A resposta vem do conhecimento geral do modelo, não de uma bula oficial ou base de dados da Anvisa em tempo real** — por isso tanto o aviso no topo do chat quanto o próprio prompt da IA deixam claro que é uma referência rápida, não uma fonte oficial, e que a bula do fabricante + julgamento do farmacêutico responsável são sempre a decisão final antes de orientar ou vender pra um cliente.
- **Prompt e foto são customizáveis pela dona**, em Configurações → Vitória AI:
  - O prompt (texto que define o comportamento da IA) começa com o padrão embutido em `PROMPT_PADRAO_VITORIA_IA` (`src/lib/ia.ts`) e fica salvo em `configuracoes.vitoria_ia_prompt` — deixar o campo em branco volta a usar o padrão.
  - A foto é enviada via upload (JPEG/PNG/WEBP, até 5MB) pro bucket `branding` do Supabase Storage (`POST /api/configuracoes/vitoria-foto`) e a URL fica em `configuracoes.vitoria_ia_foto_url`; sem foto configurada, usa o desenho ilustrado padrão (SVG).
- Cada pergunta e resposta é salva em `consultas_farmaceuticas` (fica no audit trail do banco), mas o histórico mostrado no chat é local do navegador (`localStorage`) — não é compartilhado entre a equipe nem entre dispositivos, e não é pensado pra perguntas com dados pessoais de clientes.
- Requer `OPENAI_API_KEY` configurada no servidor; sem ela, o chat retorna erro explicando que a IA não está configurada.

## Importação de estoque

Em **Produtos → Importar estoque**, a dona pode subir o relatório de inventário exportado pelo sistema da farmácia pra atualizar custo e quantidade em estoque de uma vez, sem precisar cadastrar produto por produto. Três formatos de arquivo são aceitos, detectados automaticamente pela extensão.

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

### Formato 3: `.xlsx` (planilha simplificada com substância/referência/nomes parecidos)

Planilha própria da farmácia, com 5 colunas fixas na primeira aba: `NOME`, `LABORATÓRIO`, `VENDA (PREÇO)`, `QUANTIDADE`, `OBSERVAÇÕES`. O parser (`src/lib/estoque-xlsx-import.ts`, usando a lib `xlsx`) lê a planilha inteira de uma vez — não tem reconstrução de linha por posição como no `.pdf`, cada linha da tabela já é uma linha de produto.

A coluna `OBSERVAÇÕES` é o diferencial desse formato: traz texto como `"Substância: paracetamol | Referência: Tylenol | Nomes parecidos: paracetamol, paracatamol, tylenol, acetaminofeno"` pra cada produto. Esse texto é gravado em `produtos.observacoes` e a função `buscar_produtos` (RPC usada pela IA "Vitória" pra checar se um produto existe) passou a pesquisar também nesse campo, além do nome — assim, uma cliente perguntando por "Tylenol" encontra o produto mesmo ele estando cadastrado só como "Paracetamol 750mg", reduzindo os casos em que a IA responde errado que não tem o produto.

Assim como o `.pdf`, esse formato **não tem código/SKU** — casa por **nome normalizado**. Diferente do `.pdf`, a coluna de preço vem sempre preenchida nesse relatório, então **laboratório, estoque, observações e preço de venda são sempre atualizados** nos produtos já cadastrados que baterem pelo nome (sem a checagem de "venda > 0" que o `.pdf` faz). Linhas sem `NOME` são ignoradas; linhas com o mesmo nome repetido dentro do próprio arquivo contam como duplicadas e só a primeira ocorrência é usada.

### O que a importação faz (e o que NÃO faz)

- **Nunca apaga nada.** Produtos que estão no catálogo mas não vieram no arquivo continuam exatamente como estavam.
- **`.fp3`: nunca sobrescreve o preço de venda de um produto que já existe** — só laboratório, custo e estoque são atualizados; sem preço de venda nesse formato, o preço é sempre ajustado manualmente pela dona.
- **`.pdf`: atualiza o preço de produtos já existentes com o valor real da coluna "Venda"** do relatório (quando essa linha tiver uma venda válida) — esse formato traz preço de venda de verdade, então é tratado como fonte confiável pra reajuste de preço em massa.
- **`.xlsx`: atualiza laboratório, estoque, observações e preço** dos produtos já existentes que baterem pelo nome — esse formato é a fonte mais completa das três, incluindo o texto de sinônimos usado na busca da IA.

### Rota

`POST /api/produtos/importar-estoque` — autenticada por sessão, só a dona pode chamar. Recebe o arquivo via `multipart/form-data` (campo `file`), processa em lotes de 500 linhas e devolve um resumo (`total`, `criados`, `atualizados`, `erros`, `ignoradas`, e `paginasParaRevisar` no caso do PDF). Cada importação fica registrada em Configurações → Atividade.

### Limpar produtos duplicados

Como o `.pdf` casa produtos pelo nome (sem código/SKU), qualquer importação feita antes de uma correção no parser pode ter deixado produtos duplicados no catálogo (o mesmo produto cadastrado 2x, com preço/estoque diferentes entre as cópias). Em **Produtos → Limpar duplicados**, a dona vê uma prévia de quantos grupos duplicados existem antes de confirmar a remoção — mantém sempre a linha mais recentemente atualizada de cada nome e remove as outras. Produtos já usados em algum pedido nunca são removidos (o banco tem uma trava de chave estrangeira pra isso — `pedido_itens.produto_id references produtos(id)`). Rota: `GET /api/produtos/duplicados` (prévia, só leitura) e `POST /api/produtos/duplicados` (executa), ambas só a dona.

## Vitrine (integração com o site público)

Em **Vitrine**, a dona cadastra os itens/promoções que aparecem no site institucional (`farmaciaprecobom.com.br`, projeto separado — repo `site-farmacia-pre-o-bom`) — título, descrição, selo (ex.: "Gripe"), preço, foto, vídeo opcional e se está visível agora. É a única tela que edita o que o site mostra; o site nunca é editado direto.

Como funciona de ponta a ponta:

- **Escrita**: as ações de criar/editar/excluir/reordenar acontecem direto do navegador (Supabase client-side), protegidas por RLS na tabela `vitrine_itens` (só `is_dona()` grava). Fotos e vídeos sobem por `POST /api/vitrine/upload` (essa rota usa a service role, então precisa ir por trás do servidor) pro bucket `branding` do Storage — imagem até 5MB (JPEG/PNG/WEBP), vídeo até 25MB (MP4/WEBM).
- **Leitura pelo site**: o site lê a tabela `vitrine_itens` **direto do Supabase**, com a chave `anon`, sem passar pelo CRM — a RLS só libera `select` dos itens com `ativo = true` pra quem não está logado (política `vitrine_itens_select_publico`); a equipe logada no painel vê todos, inclusive os ocultos.
- **Atualização do site**: o site usa ISR do Next.js (revalida sozinho a cada alguns minutos) e, pra não esperar isso, toda vez que a dona salva algo em Vitrine o CRM chama a URL configurada em Configurações → Integrações (`site_revalidate_url`) — o site atualiza a página em segundos. Essa chamada é só best-effort: se a URL não estiver configurada ou o site estiver fora do ar, a ação no CRM não falha por causa disso.
- Sem nenhum item cadastrado, o site mostra uma lista padrão fixa (não fica vazio) até a dona adicionar o primeiro.

Nada sensível passa por essa tabela (nunca estoque, custo ou dados de cliente) — é seguro que o site leia isso publicamente.

## Estrutura

```
src/
  app/
    auth/login/            # login (Supabase Auth)
    (app)/                 # área autenticada (sidebar + header)
      dashboard/            # métricas (só dona)
      pedidos/              # fila de separação
      encomendas/           # produto fora de estoque encomendado pro cliente (avisa por WhatsApp ao chegar)
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
