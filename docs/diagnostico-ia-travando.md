# Diagnóstico: a IA travando sem motivo

Data da investigação: 05/11/2026. Fontes: código do CRM (este repositório), o
fluxo ativo do N8N **"Farmácia Preço Bom - Receber Mensagem (WhatsApp/IA)"**
(id `GNwNsh8vMoZW9N1a`) e as execuções reais desse fluxo entre 04/11 e 05/11.

## Como a decisão "a IA pode responder?" funcionava

Duas travas independentes, conferidas a cada mensagem do cliente:

| Trava | Onde fica | Quem liga | Quando desliga |
|---|---|---|---|
| **Pausa curta** | Redis, chave `farmacia_<telefone>_block` (10 min) | N8N, quando alguém da farmácia manda mensagem pelo celular (`fromMe`) ou pelo chat do CRM | Sozinha, em 10 min (TTL do Redis) |
| **Trava do CRM** | Banco, `conversas.status = 'aguardando_humano'` (lida pela função `deve_ia_responder`) | Várias rotas do CRM (ver abaixo) | **Nunca sozinha** — só clicando em "Destravar" |

O nó do N8N "identificar tipo de bloqueio" trata a trava do CRM como
**permanente** ("botão do CRM"), e o aviso que o N8N grava no chat diz:
*"⏸️ IA pausada por 10 min… Volta sozinha; cada nova resposta renova o tempo.
Para travar de vez, use o botão do CRM."*

## Causa raiz 1 (principal): a trava do CRM não tinha prazo e era ligada sozinha

`conversas.status = 'aguardando_humano'` era gravado — sem prazo e sem motivo
registrado — por:

1. `POST /api/chat/enviar` (toda resposta de texto pelo Chat ao vivo)
2. `POST /api/chat/enviar-audio` (todo áudio pelo Chat ao vivo)
3. `POST /api/chat/nova-conversa`
4. A ferramenta `chamar_atendente` da IA (envia `conversa_status: aguardando_humano`)
5. A mesclagem de conversas duplicadas (herdava a trava)
6. O botão "Travar" da tela

E o webhook `/api/webhooks/mensagem` **preservava** a trava de propósito em
toda mensagem nova. Não existia nenhum caminho automático de volta.

**Contradição de regra:** o N8N promete 10 minutos; o CRM aplicava "para
sempre". A equipe respondia uma vez pelo CRM, via o aviso "volta sozinha" — e
a IA nunca mais respondia aquele cliente.

**Evidência** (execução `316984`, 05/11 12:40 UTC, cliente "Viacont"):
`checar bloqueio1` = pausa curta do Redis até 12:43 **e**
`verificar bloqueio CRM1` = `false` → `tipo_bloqueio: "permanente"`. A
mensagem do cliente foi só registrada, sem resposta. Nos minutos anteriores
(execução `316871`) o único evento foi uma atendente escrevendo pelo celular,
que deveria gerar só a pausa de 10 min.

## Causa raiz 2: aviso automático tratado como resposta de atendente

O aviso de **encomenda chegou** (`/api/encomendas/:id/status`) saía pelo mesmo
webhook do N8N usado pelas respostas da equipe ("Webhook Envia"). Esse caminho
**sempre** grava a pausa de 10 min e escreve no chat "a atendente respondeu
pelo chat do CRM". Ou seja: mover um cartão para "Chegou" pausava a IA daquele
cliente sem ninguém ter falado com ele.

## Causa raiz 3: transferência da IA sem retorno (e sem despedida)

Quando a IA chama `chamar_atendente`, a conversa fica travada sem prazo (correto
na hora), mas: (a) não voltava nunca; (b) a mensagem final da IA ("vou chamar a
atendente…") é barrada pelo nó "IA ainda pode responder?", que relê o CRM já
travado — o cliente fica em silêncio. A parte (b) está no N8N (ver
`docs/n8n-ajustes.md`, item 3).

## Causa 4: falha de rede derruba a mensagem em silêncio

Execução `316910` (05/11 12:31 UTC): `verificar bloqueio CRM1` falhou com
`ECONNRESET` ao chamar o Supabase. O nó não tem "Retry On Fail": a execução
parou, a mensagem do cliente não foi registrada no CRM nem respondida.

## O que NÃO era causa (verificado)

- **Eco das mensagens da própria IA**: mensagens enviadas pela API da uazapi
  não voltam como evento (ex.: a IA respondeu às 23:14:34 na execução `310653`
  e não houve nenhuma execução nova até 23:40). O filtro `wasSentByApi` também
  existe no nó "ignorar mensagem?".
- **Pausas de 10 min por `fromMe`**: as amostradas (execuções `309981`,
  `309983`, `316786`) eram atendentes digitando no celular Android
  (`source: android`, `wasSentByApi: false`). Comportamento correto.
- **Grupo da equipe**: mensagens do grupo "EQUIPE FARMÁCIA PREÇO BOM" são
  descartadas no primeiro nó (execuções `317479`, `317483`).

## Correção implementada

Migração `supabase/migrations/20261105_ia_estado_e_recuperacao_22h.sql` +
código do CRM:

| Estado conceitual | Como fica no banco | Volta sozinho? |
|---|---|---|
| `IA_ATIVA` | `status='aberta'` (ou pausa vencida) | — |
| `PAUSA_TEMPORARIA` | `status='aguardando_humano'` + `ia_pausada_ate` no futuro | **Sim**, no prazo |
| `HUMANO_ASSUMIU` | `status='aguardando_humano'` sem prazo (botão, transferência, nova conversa) | Às 22h (exceto botão "Travar") |
| `BLOQUEADA` | `clientes.ia_bloqueada = true` | **Nunca** |
| `ENCERRADA` | `status='fechada'` | Reabre na próxima mensagem |

- Resposta pelo CRM (texto/áudio) = **pausa de 10 min** que renova a cada
  resposta (mesma regra que o N8N já anunciava). Configurável em
  `configuracoes.ia_pausa_resposta_humana_minutos`.
- Uma pausa curta **nunca encurta** uma trava sem prazo (garantido por trigger).
- `deve_ia_responder()` (mesma assinatura do N8N) agora libera pausa vencida e
  acha o cliente mesmo com o telefone com/sem 55 e com/sem o 9º dígito.
- Toda mudança grava um evento em `conversa_eventos_ia`
  (`conversa_id`, estado anterior/novo, motivo, ator, evento, data).
- Avisos automáticos (encomenda, pedido) saem **direto pela uazapi** e não
  pausam a IA.
- Webhook repetido: `mensagens.externo_id` único (quando o N8N mandar
  `mensagem_externa_id`).
- Rotina diária às **22:00 de Salvador**: reativa pausas, transferências e travas
  antigas; preserva número bloqueado e trava manual; não envia mensagem;
  idempotente e com trava de concorrência.

Testes: `npm run test:sql` (55 verificações no banco) e `npm test`.
