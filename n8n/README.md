# Disparo de campanha com proteção anti-ban

`disparar-campanha-antiban.json` substitui o fluxo antigo de disparo. Importe
no N8N (Workflows → Import from File).

## ANTES DE QUALQUER COISA: trocar os segredos vazados

O fluxo antigo tinha as chaves escritas dentro do JSON. Elas precisam ser
**rotacionadas**, porque o arquivo já circulou:

| Segredo | Onde rotacionar | Por que urge |
|---|---|---|
| `service_role` do Supabase | Supabase → Settings → API → Rotate | Passa por cima de todo o RLS: lê e escreve qualquer tabela do CRM |
| Token da instância uazapi | Painel da uazapi | Quem tiver o token manda mensagem pelo WhatsApp da farmácia |
| `N8N_WEBHOOK_SECRET` | `.env` do CRM + credencial no N8N | Deixa qualquer um disparar campanha e mudar status |

O fluxo novo **não guarda segredo nenhum**. Ele usa credenciais do N8N.

## 1. Rodar a migração

`supabase/migrations/20260828_campanhas_antiban.sql` no SQL editor do Supabase.
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
2. `limitePorExecucao: 5` e `limiteDia: 20` no começo.
3. Crie uma campanha de teste com 3–5 contatos seus. Dispare pelo botão do
   CRM e acompanhe a execução no N8N.
4. Confira em `campanha_envios` se gravou certo.
5. Suba os tetos aos poucos ao longo de uns dias — número novo ou parado
   há tempo aguenta bem menos que número movimentado. Se aparecer bloqueio
   temporário, volte pro patamar anterior e fique nele.

## O que ainda falta (não está neste fluxo)

O rodapé promete "responda SAIR", mas **quem recebe o SAIR é o fluxo de
mensagem recebida**, não este. Sem tratar isso, a promessa fica no vácuo —
que é pior do que não prometer. É preciso, no fluxo de mensagem recebida
(ou no `/api/webhooks/mensagem` do CRM): ao receber "SAIR"/"PARAR"/
"DESCADASTRAR", gravar `aceita_campanhas = false` e `optout_em = now()` no
cliente, e responder confirmando.
