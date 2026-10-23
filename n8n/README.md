# Disparo de campanhas — versão nova (fila nativa da uazapi)

Desde outubro/2026 as campanhas **não saem mais pelo N8N mensagem a mensagem**.
O CRM monta lotes de 20 pessoas e entrega cada lote à fila de campanhas da
própria uazapi (`POST /sender/advanced`), que cuida do intervalo entre as
mensagens. O N8N só "dá a batida" a cada 2 minutos. Código:
`src/lib/campanhas/disparo.ts` (fluxo) e `src/lib/campanhas/regras.ts`
(painel de controle: ritmo, tetos, janela, rodapé).

## Passo a passo da troca (nesta ordem)

1. **Desative o fluxo antigo** "Disparar Campanha (anti-ban)" no N8N.
   ⚠️ Se os dois ficarem ativos, o antigo continua mandando por `/send/text`
   pra quem ainda não está em lote — a mesma campanha sairia por dois caminhos.
2. **Rode a migração** `supabase/migrations/20261023_campanhas_disparo_uazapi.sql`
   no SQL editor do Supabase. Ela só adiciona (tabela `campanha_lotes`, colunas
   em `campanha_envios`, status `agendado`/`cancelado`).
3. **Publique o CRM** com este código.
4. **Importe `tick-campanhas.json`** no N8N, selecione a credencial
   `CRM Farmácia (N8N_WEBHOOK_SECRET)` no nó HTTP, confira a URL do CRM e ative.
5. No CRM, em **Campanhas**, clique em **Ativar** na faixa "Acompanhamento de
   entrega". Isso cria um webhook **adicional** na uazapi (eventos `sender` e
   `messages_update`) apontando pra `/api/webhooks/uazapi` — o webhook que já
   leva as mensagens pro N8N não é alterado. Se o CRM estiver atrás de proxy e
   o endereço detectado sair errado, defina `CRM_URL_PUBLICA` no servidor.
6. Estreie com uma campanha de 3–5 contatos seus (ver "Como estrear" abaixo).

## Como funciona agora

```
N8N a cada 2 min ──┐
Botão Disparar ────┼─→ POST /api/campanhas/processar (rodada)
uazapi "lote done" ┘        │
                            ├─ 1. sincroniza lotes: /sender/listfolders + /sender/listmessages
                            │     → campanha_envios: enviado / falhou / message_id
                            ├─ 2. travas: disjuntor (5 falhas seguidas → stop),
                            │     campanha pausada → stop, fora do horário → stop
                            └─ 3. sem lote rodando? retoma o pausado ou cria o próximo:
                                  WhatsApp conectado? → limite do WhatsApp (/instance/wa_messages_limits)
                                  → cota do dia → público (filtrar_clientes_campanha)
                                  → /chat/check → reserva no banco → /sender/advanced

uazapi messages_update ─→ /api/webhooks/uazapi → entregue_em / lido_em
```

| # | Proteção | Onde |
|---|---|---|
| 1 | Intervalo sorteado de 25–75s entre mensagens (feito pela uazapi) | `delayMin`/`delayMax` do lote |
| 2 | Parada longa de 4–9 min entre lotes de 20 | `scheduled_for` do lote seguinte |
| 3 | Janela 8h–20h, seg a sáb; lote dimensionado pra caber nela | `regras.ts` |
| 4 | WhatsApp precisa estar conectado | `/instance/status` |
| 5 | Pausa se o WhatsApp sinalizar restrição de novas conversas | `/instance/wa_messages_limits` |
| 6 | Teto de 250/dia (todas as campanhas) | `campanha_envios` do dia |
| 7 | Sem WhatsApp, telefone inválido ou estrangeiro: não envia | `/chat/check` + `regras.ts` |
| 8 | Ninguém recebe duas vezes (reserva com índice único antes de enviar) | `campanha_envios` |
| 9 | Um lote ativo por vez na instância (índice único no banco) | `campanha_lotes` |
| 10 | Disjuntor: 5 falhas seguidas pausam a campanha | rodada |
| 11 | Rodapé "responda SAIR" + filtro de opt-out | `regras.ts` + `aceita_campanhas` |

**Pausar / Retomar** na tela de Campanhas usam `POST /sender/edit` (`stop` /
`continue`): o lote para na uazapi e continua de onde parou.

A uazapi também pausa a fila sozinha enquanto alguém da farmácia manda
mensagem pelo chat (`paused_for_direct_message`), então o atendimento ao vivo
não fica atrás da campanha.

---

# (Legado) Disparo de campanha pelo N8N, mensagem a mensagem

> Tudo daqui pra baixo descreve o fluxo antigo `disparar-campanha-antiban.json`,
> mantido só como referência. **Ele deve ficar desativado.** As seções
> "Variáveis na mensagem", "Como estrear", "Filtro de público" e "Descadastro"
> continuam valendo pro disparo novo.

## ANTES DE QUALQUER COISA: trocar os segredos vazados

O fluxo antigo tinha as chaves escritas dentro do JSON. Elas precisam ser
**rotacionadas**, porque o arquivo já circulou:

| Segredo | Onde rotacionar | Por que urge |
|---|---|---|
| `service_role` do Supabase | Supabase → Settings → API → Rotate | Passa por cima de todo o RLS: lê e escreve qualquer tabela do CRM |
| Token da instância uazapi | Painel da uazapi | Quem tiver o token manda mensagem pelo WhatsApp da farmácia |
| `N8N_WEBHOOK_SECRET` | `.env` do CRM + credencial no N8N | Deixa qualquer um disparar campanha e mudar status |

O fluxo novo **não guarda segredo nenhum**. Ele usa credenciais do N8N.

## 1. Rodar as migrações (nesta ordem)

1. `supabase/migrations/20260828_campanhas_antiban.sql`
2. `supabase/migrations/20261006_campanhas_pausa_e_optout.sql` — adiciona o status
   `pausada` e a coluna `motivo_pausa`. **Rode antes de importar o fluxo atualizado**:
   sem ela, o nó "Pausar campanha pra revisão" é rejeitado pelo banco.

No SQL editor do Supabase.
Ela só adiciona coisas (coluna de opt-out + tabela `campanha_envios`), não
remove nem reescreve nada. **O fluxo não funciona sem ela** — as consultas
filtram por `aceita_campanhas` e gravam em `campanha_envios`.

## 2. Criar as três credenciais no N8N

Os nós já apontam pra elas pelo nome; é só selecionar em cada nó marcado
em vermelho depois de criar.

**`Supabase Farmácia (service_role)`** — tipo *Custom Auth*:
```json
{ "headers": {
    "apikey": "SUA_SERVICE_ROLE_NOVA",
    "Authorization": "Bearer SUA_SERVICE_ROLE_NOVA"
} }
```

**`UAZAPI Farmácia (token da instância)`** — tipo *Header Auth*:
`Name: token` / `Value: SEU_TOKEN_NOVO`

**`CRM Farmácia (N8N_WEBHOOK_SECRET)`** — tipo *Header Auth*:
`Name: Authorization` / `Value: Bearer SEU_SEGREDO_NOVO`
(usada nas duas pontas: valida o webhook que chega do CRM e assina a
chamada de volta que marca a campanha como enviada)

## 3. Conferir as URLs

Se o projeto Supabase, a instância uazapi ou o domínio do CRM mudarem, as
URLs estão nos nós HTTP. O resto da configuração está num lugar só: o nó
**Preparar campanhas**.

## 4. Ativar

Só depois de um teste com campanha pequena (ver "Como estrear" no fim).

---

## O que o fluxo faz

```
Webhook /DISPARAR-CAMPANHA-FARMACIA ─┬─→ responde 202 na hora
                                     └─→ busca a campanha pelo id
A cada 5 min ──────────────────────────→ busca campanhas agendadas vencidas
                                              │
                                     Preparar campanhas (config + dedup)
                                              │
                                        Loop Campanhas
                                              │
                              Checar instância → Pode disparar agora?
                                              │ (conectada + dentro da janela)
                     Buscar clientes → já enviados → cota do dia
                                              │
                                        Montar fila
                                              │
                              Checar números no WhatsApp (1 chamada)
                                              │
                                    Separar quem tem WhatsApp
                                        │              │
                                  Loop Clientes    Registrar sem WhatsApp
                                        │
                        Enviar → Ritmo e proteção → Registrar envio
                                        │
                              Abortar? ─sim→ Pausar campanha pra revisão
                                        └─não→ Aguardar (25-75s) → próximo
```

## As dez proteções

| # | Proteção | Onde |
|---|---|---|
| 1 | Pausa sorteada de 25–75s entre mensagens | `Aguardar` + `Ritmo e proteção` |
| 2 | Parada longa (4–9 min) a cada 20 mensagens | `Ritmo e proteção` |
| 3 | Janela de horário: 8h–20h, seg a sáb | `Pode disparar agora?` |
| 4 | Instância precisa estar conectada | `Checar instância` |
| 5 | Teto de 250/dia e 60/rodada | `Montar fila` |
| 6 | Números sem WhatsApp são pulados | `Checar números no WhatsApp` |
| 7 | Telefone inválido/estrangeiro é descartado | `Montar fila` |
| 8 | Quem já recebeu não recebe de novo | `Buscar já enviados` + índice único |
| 9 | Rodapé "responda SAIR" + filtro de opt-out | `Montar fila` + `aceita_campanhas` |
| 10 | Disjuntor: 5 falhas seguidas param tudo | `Ritmo e proteção` |

## Onde mexer

Tudo num lugar só, no nó **Preparar campanhas**:

```js
pausaMinSeg: 25,      pausaMaxSeg: 75,       // ritmo entre mensagens
loteTamanho: 20,                              // mensagens até a parada longa
pausaLongaMinMin: 4,  pausaLongaMaxMin: 9,
limiteDia: 250,       limitePorExecucao: 60, // tetos de volume
horaInicio: 8,        horaFim: 20,
diasPermitidos: [1,2,3,4,5,6],                // 0 = domingo
falhasSeguidasParaAbortar: 5,
rodapeOptout: '\n\nPara não receber mais, responda SAIR.',
```

Com o padrão, o ritmo dá **~50 mensagens por hora**. 250 contatos levam
cerca de 5 horas — de propósito. O fluxo continua sozinho de rodada em
rodada até acabar a lista.

## Variáveis na mensagem da campanha

- `{{nome}}` → primeiro nome. Sem nome no cadastro, a frase é reescrita
  em vez de virar "Oi, !".
- `{{saudacao}}` → sorteia entre "Oi" e "Olá".

O rodapé de descadastro é acrescentado sozinho, uma vez só.

## Como estrear (não ative direto na lista inteira)

1. Rode a migração.
2. No disparo novo: `loteTamanho: 5` e `limiteDia: 20` em `src/lib/campanhas/regras.ts` no começo.
3. Crie uma campanha de teste com 3–5 contatos seus. Dispare pelo botão do
   CRM e acompanhe na própria tela de Campanhas (lote, enviadas, entregues, lidas).
4. Confira em `campanha_envios` se gravou certo.
5. Suba os tetos aos poucos ao longo de uns dias — número novo ou parado
   há tempo aguenta bem menos que número movimentado. Se aparecer bloqueio
   temporário, volte pro patamar anterior e fique nele.

## Filtro de público

Ao criar a campanha, "Filtrar quem vai receber" combina (com **E**): origem
(WhatsApp/Instagram), última conversa (últimos N dias ou sem falar há N dias),
tags (qualquer uma) e contatos escolhidos à mão. A tela mostra na hora quantos
vão receber.

Quem decide é a função SQL `filtrar_clientes_campanha(filtro)`
(`supabase/migrations/20261006_filtro_publico_campanha.sql`): o CRM usa pra
prévia e o nó "Buscar clientes da campanha" usa pro disparo, então o número da
tela é o que sai. Quem pediu SAIR nunca entra. **Rode essa migração antes de
publicar o fluxo atualizado.**

## Descadastro (SAIR) — já tratado no CRM

Quando o cliente responde **SAIR / PARAR / PARE / DESCADASTRAR / STOP** (a
mensagem inteira, não uma frase que contenha a palavra), o
`/api/webhooks/mensagem` do CRM grava `aceita_campanhas = false` +
`optout_em` e manda uma confirmação pela uazapi (usa `UAIZAP_BASE_URL` e
`UAIZAP_API_KEY` do servidor). Isso funciona sem mexer no fluxo de mensagem
recebida, porque ele já registra toda mensagem do cliente nessa rota.

A resposta da rota ganha `"optout": true` nesse caso. **Passo manual
recomendado** no fluxo "Receber Mensagem (WhatsApp/IA)": depois do nó
*registrar mensagem do cliente*, um IF em `{{ $json.optout }}` que, se
verdadeiro, encerra sem chamar a IA — senão a Vitória também tenta
responder o "SAIR".

Também existe `POST /api/webhooks/optout` (`{ "telefone": "..." }`, mesmo
Bearer `N8N_WEBHOOK_SECRET`) pra descadastrar por outro fluxo.

## Campanha pausada

Se o disjuntor parar o disparo, a campanha vira **Pausada** no CRM, com o
motivo, e o botão passa a ser **Retomar**. Retomar não reenvia pra quem já
recebeu (índice único em `campanha_envios`). A tela de Campanhas mostra o
relatório: enviadas, falhas, sem WhatsApp e inválidos.
