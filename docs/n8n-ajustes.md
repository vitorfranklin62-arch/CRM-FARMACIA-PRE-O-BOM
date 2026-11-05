# Ajustes no N8N

Fluxo principal: **"Farmácia Preço Bom - Receber Mensagem (WhatsApp/IA)"** (`GNwNsh8vMoZW9N1a`).

## Situação em 05/11/2026

| Item | Situação |
|---|---|
| 1. Token da instância no webhook | ✅ Aplicado e publicado (versão `3b28e22f`) |
| 2. Retry nas consultas ao Supabase | ✅ Aplicado e publicado |
| 3. Despedida da IA ao transferir | ✅ Aplicado e publicado |
| 4. `mensagem_externa_id` | ✅ Aplicado e publicado |
| 7. SAIR / mensagem repetida não aciona a IA | ✅ Aplicado (nó `seguir para a IA?`) |
| 6. Rotina das 22h no N8N | ✅ Fluxo `Farmácia Preço Bom - Reativar IA às 22h` (`uYQA7wfLyWQiFjCx`), ativo |
| 5. Ferramentas novas da Vitória | ⏳ Só depois que o CRM novo estiver publicado |
| 8. Retenção das execuções | Decisão da dona |

**Voltar atrás:** no N8N, abra o fluxo → menu de versões → restaure a versão
"Pausa humana: 10 min de verdade" (`783102de…`, de 30/10).

### ⚠️ Se trocar o token da instância da uazapi
O nó `ignorar mensagem?` compara a impressão digital (SHA-256) do token que a
uazapi manda em cada evento — o token em si não fica no fluxo. **Se o token for
trocado, todas as mensagens passam a ser descartadas** (aparecem no nó
`ignorar (grupo, eco da API ou token inválido)`) até o hash ser atualizado.
Para gerar o novo: no terminal, `printf '%s' 'NOVO_TOKEN' | sha256sum`, e cole o
resultado no lugar do hash antigo dentro da expressão do nó.

## Detalhes de cada ajuste

### Prioridade ALTA

### 1. Proteger o webhook de entrada (segurança)
O nó `Webhook Recebe` aceitava qualquer POST — o "segredo" era só a URL. Quem
descobrisse a URL conseguia forjar mensagens, inclusive `fromMe: true`, que
**pausam a IA** de qualquer cliente. A uazapi manda o `token` da instância no
corpo de todo evento; o nó `ignorar mensagem?` agora descarta o evento quando
`String($json.body.token).hash('sha256')` não bate com o hash da instância.

### 2. Tentar de novo quando o Supabase oscilar
Nos nós `verificar bloqueio CRM1` e `rechecar bloqueio (CRM)`: **Settings →
Retry On Fail = ligado, Max Tries = 3, Wait Between Tries = 1000 ms**.
Evidência: execução `316910` perdeu a mensagem do cliente por um `ECONNRESET`.

### 3. Despedida da IA ao transferir
Hoje, depois que a IA chama `chamar_atendente`, a última mensagem dela é
barrada no nó `IA ainda pode responder?` (o CRM já está travado). No campo da
condição, troque por:
```
{{ !$('rechecar bloqueio (Redis)').item.json.isblocked && (!!($('rechecar bloqueio (CRM)').item.json.data ?? $('rechecar bloqueio (CRM)').item.json) || $('chamar_atendente').isExecuted) }}
```

## Prioridade MÉDIA

### 4. Mandar o id da mensagem (anti-duplicidade)
Em todos os nós HTTP que chamam `/api/webhooks/mensagem` com mensagem do
cliente/atendente (`registrar mensagem do cliente1`, `registrar mensagem
(humano ativo)1`, `registrar resposta humana (WhatsApp)1`), acrescente no JSON:
`mensagem_externa_id: $('Dados1').item.json.messageid`. O CRM passa a ignorar o
mesmo evento entregue duas vezes.

### 5. Novas ferramentas da Vitória (consulta real ao CRM)
Adicione ao agente dois nós **HTTP Request Tool** → `POST
https://<crm>/api/ia/ferramentas`, credencial "CRM Farmácia
(N8N_WEBHOOK_SECRET)":

- `consultar_pedidos` — descrição: *"Consulta os pedidos do cliente desta
  conversa (etapa, pagamento, código). Use quando o cliente perguntar do
  pedido. Nunca invente status."* Corpo:
  `{ "ferramenta": "consultar_pedidos", "telefone_cliente": "{{ $('Dados1').item.json.CELULAR }}" }`
- `registrar_pendencia` — descrição: *"Registra para a equipe algo que você não
  pode resolver: reclamação, produto em falta, problema no pedido, pagamento."*
  Corpo:
  `{ "ferramenta": "registrar_pendencia", "telefone_cliente": "{{ $('Dados1').item.json.CELULAR }}", "argumentos": { "tipo": "{{ $fromAI('tipo', 'reclamacao | produto_indisponivel | problema_pedido | pagamento | outro') }}", "resumo": "{{ $fromAI('resumo', 'o que o cliente precisa, em 1-3 frases') }}" } }`

**Importante:** `telefone_cliente` vem sempre de `Dados1` (do WhatsApp), nunca
de `$fromAI`. É isso que impede um cliente de pedir dados de outra pessoa.

### 6. Rotina das 22h sem pg_cron (só se precisar)
Se o Supabase não tiver o pg_cron (o painel Operações avisa), crie um fluxo:
**Schedule Trigger** (todo dia 22:00, fuso do fluxo `America/Bahia`) →
**HTTP Request** `POST https://<crm>/api/automacoes/recuperacao-ia` com a
credencial "CRM Farmácia (N8N_WEBHOOK_SECRET)". Pode coexistir com o pg_cron:
o banco só executa uma vez por dia.

## Prioridade BAIXA

### 7. Descadastro (SAIR)
Já recomendado no `n8n/README.md`: depois de `registrar mensagem do cliente1`,
um IF em `{{ $json.optout }}` que encerra sem chamar a IA.

### 8. Dados sensíveis no histórico de execuções
O fluxo salva todas as execuções com o corpo completo do evento, que inclui o
token da instância e o texto das conversas. Considere reduzir a retenção
(Settings → Save successful executions) ou ativar a redação de dados.
