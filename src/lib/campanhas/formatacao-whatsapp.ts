/**
 * Lê a formatação do WhatsApp (*negrito*, _itálico_, ~tachado~, ```mono```)
 * e devolve uma árvore simples que a prévia transforma em elementos React.
 * Nunca gera HTML em texto: o conteúdo é sempre tratado como texto puro, então
 * nada que a pessoa digite vira código na tela.
 *
 * Mesmas regras práticas do aplicativo: o marcador precisa "abraçar" texto
 * (sem espaço logo depois de abrir nem logo antes de fechar), não atravessa
 * quebra de linha (exceto ```), e não abre no meio de uma palavra
 * (2*3*4 continua "2*3*4").
 */

export type NoFormatado =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrito" | "italico" | "tachado"; filhos: NoFormatado[] }
  | { tipo: "mono"; texto: string };

const MARCADORES: Record<string, "negrito" | "italico" | "tachado"> = { "*": "negrito", _: "italico", "~": "tachado" };
const LETRA_OU_NUMERO = new RegExp("[\\p{L}\\p{N}]", "u");

function bordaValida(caractere: string | undefined): boolean {
  return caractere === undefined || !LETRA_OU_NUMERO.test(caractere);
}

export function formatarWhatsapp(texto: string): NoFormatado[] {
  const nos: NoFormatado[] = [];
  let pedaco = "";
  const soltarPedaco = () => {
    if (pedaco) nos.push({ tipo: "texto", texto: pedaco });
    pedaco = "";
  };

  let i = 0;
  while (i < texto.length) {
    // ```bloco monoespaçado``` (pode ter quebra de linha)
    if (texto.startsWith("```", i)) {
      const fim = texto.indexOf("```", i + 3);
      if (fim > i + 3) {
        soltarPedaco();
        nos.push({ tipo: "mono", texto: texto.slice(i + 3, fim) });
        i = fim + 3;
        continue;
      }
    }

    const c = texto[i];
    const tipo = MARCADORES[c];
    if (tipo && bordaValida(texto[i - 1]) && texto[i + 1] && !/\s/.test(texto[i + 1]) && texto[i + 1] !== c) {
      // Procura o fechamento na mesma linha.
      let fim = -1;
      for (let j = i + 1; j < texto.length && texto[j] !== "\n"; j++) {
        if (texto[j] === c && !/\s/.test(texto[j - 1]) && bordaValida(texto[j + 1])) {
          fim = j;
          break;
        }
      }
      if (fim > i + 1) {
        soltarPedaco();
        nos.push({ tipo, filhos: formatarWhatsapp(texto.slice(i + 1, fim)) });
        i = fim + 1;
        continue;
      }
    }

    pedaco += c;
    i++;
  }
  soltarPedaco();
  return nos;
}
