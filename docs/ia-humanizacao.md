# IA do WhatsApp "parecendo robô": diagnóstico e correção

Data: 13/11/2026. Fluxo: **"Farmácia Preço Bom - Receber Mensagem (WhatsApp/IA)"**
(`GNwNsh8vMoZW9N1a`), nó `vitoria (agente IA)1`.

## O que estava acontecendo

### 1. A IA estava sem nenhuma instrução (causa principal)
O campo **System Message** do agente estava **vazio** desde a versão salva em
12/11/2026 15:25 (única versão no histórico do N8N; não há cópia do prompt
anterior em lugar nenhum). Confirmado nas execuções: o modelo recebia só a
mensagem do cliente, sem nada dizendo que era uma farmácia.

Efeitos reais (execuções de 13/11):
- `419224`: cliente mandou foto de uma moto → a IA ofereceu "identificar
  modelo/ano e peças", "manutenção", "oficinas próximas".
- `418868`: cliente pediu clonazepam → a IA ofereceu **"procurar em outras
  farmácias"**, mostrou **quantidade em estoque** ("estoque: 1") e mandou 4
  balões com listas e menus.
- `410339`: "Ainda está aberto" → resposta com menu de 4 opções.

A descrição da ferramenta `chamar_atendente` ainda citava "seção 20 do
prompt", ou seja: existia um prompt grande que foi apagado.

### 2. Mesmo antes, o estilo era robótico
Mensagens de 06 a 11/11 (com o prompt antigo): "Oi! Sou a Vitória 👋
assistente virtual" repetido no meio da conversa, "Perfeito! ✅" em quase toda
resposta, 3 ou 4 emojis por mensagem, quantidade em estoque e código do pedido
para o cliente.

### 3. Pedido criado sem forma de pagamento, sem taxa e com produto duplicado
- A ferramenta `criar_pedido1` não enviava `forma_pagamento` nem
  `taxa_entrega`, que o CRM já aceita (`/api/webhooks/pedido`). Os 18 pedidos
  da IA estão com `forma_pagamento` vazio e o total sem a entrega.
- Os itens iam só com o nome. O CRM procura o produto pelo nome exato e, se
  não acha, **cria um produto novo**. Isso já gerou "Vagifem 10mcg (18
  comprimidos)" duplicado em 07/11.
- `pagamento_status` era escolhido pela IA ("confirmado se já pagou"), sem
  ninguém conferir o comprovante.

### 4. Tempo de digitação fixo
Todo balão saía com 4 s de "digitando...", fosse "Ok" ou um parágrafo.

## O que foi feito

| Item | Onde |
|---|---|
| Prompt novo (persona, estilo de WhatsApp, regras de farmácia, transferência) | `n8n/prompts/vitoria-atendimento-whatsapp.txt` |
| Separador de balões com limpeza de vícios de robô e tempo de digitação proporcional | `n8n/prompts/dividir-mensagens.js` + `tests/dividir-mensagens.test.ts` |
| `criar_pedido1` passa a mandar `produto_id`, `forma_pagamento`, `taxa_entrega` e sempre `pagamento_status: pendente` | nó no N8N |
| Raciocínio do modelo em "low" (respostas em ~4-6 s em vez de 8-13 s) | nó `OpenAI Chat Model1` |
| Foto chega para a IA como "[Foto enviada pelo cliente] Descrição automática…" e a análise da imagem não copia nome de paciente | nós `Analyze image1` e `set image message1` |

Tudo foi testado num fluxo separado, **"TESTE — Vitória prompt humanizado
(pode apagar)"** (`38J2TrzesHcRsiwV`), com o mesmo modelo e as buscas reais de
produto e taxa, e com "criar pedido"/"chamar atendente" simulados.

## Como evitar que se perca de novo
O prompt oficial é o arquivo do repositório. Ver `n8n/prompts/README.md`.
