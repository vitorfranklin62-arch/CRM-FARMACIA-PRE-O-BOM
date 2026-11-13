# Prompts das IAs no N8N

Os prompts das IAs moram dentro dos nós do N8N, e o N8N **não guarda histórico
confiável** deles (o fluxo de atendimento tinha só 1 versão salva). Em 12/11/2026
o prompt da Vitória do WhatsApp sumiu do nó e a IA passou a responder como um
ChatGPT genérico — sem saber que era uma farmácia — sem ninguém perceber. Por
isso, **a fonte oficial de cada prompt é o arquivo deste diretório**. O N8N é só
onde ele é colado.

| Arquivo | Onde vai no N8N |
|---|---|
| `vitoria-atendimento-whatsapp.txt` | Fluxo **"Farmácia Preço Bom - Receber Mensagem (WhatsApp/IA)"** (`GNwNsh8vMoZW9N1a`) → nó **`vitoria (agente IA)1`** → *Options* → **System Message** |
| `dividir-mensagens.js` | Mesmo fluxo → nó **`dividir mensagens1`** (Code). Testado em `tests/dividir-mensagens.test.ts` (`npm test`) |
| `criar-pedido-corpo.txt` | Mesmo fluxo → nó **`criar_pedido1`** → **JSON Body** |

> Não confundir com a **Vitória AI interna** (widget da equipe dentro do CRM):
> aquela usa `src/lib/vitoria-prompt.ts` e `configuracoes.vitoria_ia_prompt`.

## Como alterar o prompt (passo a passo)

1. Edite o arquivo `.txt` aqui no repositório (ou peça ao Claude).
2. No N8N, abra o fluxo acima e dê dois cliques no nó `vitoria (agente IA)1`.
3. Em **Options → System Message**, apague tudo e cole o conteúdo do arquivo.
   O campo precisa estar no modo **Expression** (o texto começa com `=` por
   baixo dos panos), porque o prompt tem trechos `{{ ... }}` que são preenchidos
   a cada mensagem: data e hora de Salvador, se a loja está aberta e o nome do
   cliente.
4. Salve e clique em **Publish**.
5. Mande um "oi" do seu celular pessoal para o WhatsApp da farmácia e confira.

## O que o prompt faz

- **Persona:** Vitória, atendente da loja, com o jeito de escrever da equipe
  real (frases curtas, "tenho sim", "minha amiga", 1 emoji no máximo).
- **Anti-robô:** proíbe markdown, menus de opções, travessão, "Perfeito!" e
  "Entendi —", reapresentação no meio da conversa e termos como "sistema".
- **Contexto vivo:** sabe o dia, a hora e se a loja está aberta (seg-sáb,
  8h-20h) e o nome do cliente.
- **Dados da loja:** endereço, horário, formas de pagamento e chave Pix. **Se
  algum desses dados mudar, altere a seção "DADOS DA LOJA".**
- **Pedidos:** conduz uma pergunta por vez, confirma o resumo e só então cria o
  pedido (com forma de pagamento e taxa de entrega).
- **Segurança de saúde:** controlados e antibióticos exigem receita e vão para
  a equipe; não indica remédio nem dose; sinais de emergência → SAMU 192.
- **Honestidade:** conversa como gente, mas se perguntarem com sinceridade se é
  robô, diz que é a assistente virtual e oferece a equipe.

## Como testar sem mexer no atendimento real

Existe um fluxo de teste no N8N, **"TESTE — Vitória prompt humanizado (pode
apagar)"**, com o mesmo modelo e as mesmas buscas de produto e taxa (só
leitura). Criar pedido e chamar atendente são **simulados** nele. Cole o prompt
novo lá primeiro, rode conversas e só depois leve para o fluxo de produção.
