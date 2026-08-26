import OpenAI from "openai";

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

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ConsultaFarmaceuticaError("OPENAI_API_KEY não configurada no servidor.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

/** Erro esperado (config ausente, recusa, resposta vazia) — distinto de falhas da API da OpenAI. */
export class ConsultaFarmaceuticaError extends Error {}

/**
 * Modelo usado na consulta. Configurável por variável de ambiente pra dar
 * pra trocar (ou testar um modelo novo) sem mexer no código e sem redeploy
 * de aplicação — só reiniciar com a variável nova.
 */
const MODELO = process.env.OPENAI_MODEL || "gpt-4o";

/** Teto de tokens da resposta. Folga suficiente pra uma consulta de balcão bem detalhada. */
const MAX_TOKENS = 2000;

export async function perguntarIa(pergunta: string, promptCustom?: string | null): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: MODELO,
    max_completion_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: promptCustom?.trim() || PROMPT_PADRAO_VITORIA_IA },
      { role: "user", content: pergunta },
    ],
  });

  const escolha = response.choices[0];

  // A OpenAI devolve a recusa num campo próprio, separado do texto normal.
  if (escolha?.message?.refusal) {
    throw new ConsultaFarmaceuticaError(
      "A IA não pôde responder essa pergunta. Tente reformular focando em informações farmacêuticas gerais."
    );
  }

  if (escolha?.finish_reason === "content_filter") {
    throw new ConsultaFarmaceuticaError(
      "A resposta foi bloqueada pelo filtro de conteúdo da IA. Tente reformular a pergunta."
    );
  }

  const texto = escolha?.message?.content?.trim();

  if (!texto) {
    // "length" = o teto de tokens acabou antes da resposta terminar.
    if (escolha?.finish_reason === "length") {
      throw new ConsultaFarmaceuticaError(
        "A resposta ficou longa demais e foi cortada. Faça uma pergunta mais específica (um medicamento por vez)."
      );
    }
    throw new ConsultaFarmaceuticaError("A IA não retornou uma resposta.");
  }

  return texto;
}
