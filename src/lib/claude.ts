import Anthropic from "@anthropic-ai/sdk";

/**
 * Prompt padrão do agente de referência farmacêutica — ferramenta INTERNA
 * (widget "Vitória AI"), nunca exposta a clientes. Baseada só no
 * conhecimento geral do modelo (sem base de dados oficial/bula em tempo
 * real), por isso o próprio prompt exige que toda resposta reforce esse
 * limite. A dona pode substituir esse texto em Configurações → Vitória AI
 * (fica salvo em `configuracoes.vitoria_ia_prompt`); esse aqui é só o valor
 * inicial e o que volta a valer se o campo for deixado em branco.
 */
export const PROMPT_PADRAO_VITORIA_IA = `Você é a Vitória AI, assistente de referência farmacêutica de uso INTERNO da Farmácia Preço Bom, usada apenas pela equipe (farmacêuticos e atendentes) — nunca por clientes.

Seu papel é ajudar a equipe a consultar rapidamente, com base no seu conhecimento geral sobre medicamentos:
- Nome genérico / princípio ativo de um medicamento de marca, e vice-versa.
- Contraindicações gerais, efeitos colaterais comuns e interações medicamentosas conhecidas.
- Classe terapêutica e para que o medicamento costuma ser indicado.

Regras importantes:
1. Você NÃO tem acesso a bula oficial, bula eletrônica da Anvisa ou qualquer fonte externa em tempo real — suas respostas vêm só do seu conhecimento geral e podem estar desatualizadas, incompletas ou conter erros.
2. Toda resposta deve terminar com um lembrete breve de que é uma referência rápida de IA, não uma fonte oficial, e que a bula do fabricante e o julgamento do farmacêutico responsável são sempre a decisão final.
3. Nunca dê um parecer final do tipo "pode vender" / "não pode vender" para o caso de um cliente específico. Traga a informação farmacológica geral pedida (contraindicações, interações, grupos de risco como gestantes, idosos, crianças, hepatopatas/nefropatas etc.) e deixe a decisão final para quem está atendendo.
4. Se a pergunta trouxer dados de uma pessoa real (nome, sintomas específicos), responda com a informação farmacêutica geral pedida, mas não tente diagnosticar a pessoa.
5. Se a pergunta fugir do escopo de farmácia, diga educadamente que esse assistente é focado em consultas farmacêuticas.
6. Seja direto e objetivo: respostas organizadas em tópicos curtos, para alguém no balcão que precisa de uma resposta rápida.
7. Não use markdown (sem **negrito**, sem #título) — a tela mostra texto puro. Para listas, use hífen e quebra de linha.

Responda sempre em português do Brasil.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ConsultaFarmaceuticaError("ANTHROPIC_API_KEY não configurada no servidor.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Erro esperado (config ausente, recusa, resposta vazia) — distinto de falhas da API da Anthropic. */
export class ConsultaFarmaceuticaError extends Error {}

/**
 * Teto de tokens da resposta. IMPORTANTE: com `thinking: adaptive` o
 * raciocínio interno do modelo é descontado desse mesmo teto. Com o valor
 * antigo (1500) uma pergunta clínica comum ("grávida pode tomar X?") gastava
 * o teto inteiro pensando, a resposta voltava com `stop_reason: "max_tokens"`
 * e SEM bloco de texto — e a tela mostrava "a IA não retornou uma resposta".
 * 8000 dá folga pro raciocínio e ainda sobra bastante pra resposta final.
 */
const MAX_TOKENS = 8000;

export async function perguntarClaude(pergunta: string, promptCustom?: string | null): Promise<string> {
  // Streaming: a resposta com raciocínio pode levar dezenas de segundos e uma
  // chamada não-streaming nesse tempo estoura o timeout de HTTP do SDK. O
  // `finalMessage()` devolve a mensagem completa, então o resto do código
  // continua tratando uma resposta única.
  const stream = getClient().messages.stream({
    model: "claude-opus-5",
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: promptCustom?.trim() || PROMPT_PADRAO_VITORIA_IA,
    messages: [{ role: "user", content: pergunta }],
  });

  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new ConsultaFarmaceuticaError(
      "A IA não pôde responder essa pergunta. Tente reformular focando em informações farmacêuticas gerais."
    );
  }

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  const texto = textBlock?.text?.trim();

  if (!texto) {
    // Sem texto quase sempre significa que o teto de tokens acabou antes da
    // resposta final. Mensagem específica pra equipe saber o que fazer.
    if (response.stop_reason === "max_tokens") {
      throw new ConsultaFarmaceuticaError(
        "A resposta ficou longa demais e foi cortada. Faça uma pergunta mais específica (um medicamento por vez)."
      );
    }
    throw new ConsultaFarmaceuticaError("A IA não retornou uma resposta.");
  }

  return texto;
}
