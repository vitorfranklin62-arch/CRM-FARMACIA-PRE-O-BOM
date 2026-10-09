/**
 * Modelo oficial da planilha de estoque (.xlsx) aceita pela importação.
 *
 * Tudo aqui descreve o que `parseEstoqueXlsx` (src/lib/estoque-xlsx-import.ts)
 * e a rota /api/produtos/importar-estoque REALMENTE fazem — nada foi inventado.
 * Se o importador mudar, este arquivo precisa mudar junto.
 *
 * Regras que o importador aplica hoje (conferidas no código):
 *  - Lê só a PRIMEIRA aba; a linha 1 é o cabeçalho.
 *  - Acha cada coluna pelo NOME exato do cabeçalho (maiúsculas e acentos
 *    iguais); a ordem das colunas não importa, mas o modelo usa esta.
 *  - Linha sem NOME é ignorada. Nome repetido: só a primeira ocorrência vale.
 *  - O produto é casado com o cadastro pelo nome (sem diferenciar maiúsculas,
 *    acentos ou espaços repetidos).
 *  - VENDA (PREÇO): número, ou texto com vírgula/ponto decimal. Texto com
 *    separador de milhar ("1.234,50") ou "R$" vira 0. Preço 0 não altera o
 *    preço de um produto já cadastrado; num produto novo, entra com preço 0.
 *  - QUANTIDADE: arredondada para inteiro. Vazio vira 0 e SUBSTITUI o estoque
 *    atual do produto já cadastrado.
 *  - LABORATÓRIO e OBSERVAÇÕES vazios também SUBSTITUEM (apagam) o que já
 *    estava cadastrado no produto.
 *  - Colunas a mais no arquivo são ignoradas. Custo, código (SKU), validade e
 *    código de barras NÃO são lidos neste formato.
 */

export const COLUNAS_MODELO = ["NOME", "LABORATÓRIO", "VENDA (PREÇO)", "QUANTIDADE", "OBSERVAÇÕES"] as const;

interface DetalheColuna {
  coluna: (typeof COLUNAS_MODELO)[number];
  obrigatoria: boolean;
  formato: string;
  regra: string;
}

export const DETALHES_COLUNAS: DetalheColuna[] = [
  {
    coluna: "NOME",
    obrigatoria: true,
    formato: "Texto",
    regra: "Nome do produto, igual ao original. Linha sem nome é ignorada. Nomes repetidos: só o primeiro entra.",
  },
  {
    coluna: "LABORATÓRIO",
    obrigatoria: false,
    formato: "Texto",
    regra: "Fabricante/laboratório. Se ficar vazio, apaga o laboratório já cadastrado desse produto.",
  },
  {
    coluna: "VENDA (PREÇO)",
    obrigatoria: true,
    formato: "Número (ex.: 12.5 ou 12,50)",
    regra: "Preço de venda, só o número: sem R$ e sem ponto de milhar (1234,50 e não 1.234,50). Zero não altera o preço de produto já cadastrado.",
  },
  {
    coluna: "QUANTIDADE",
    obrigatoria: true,
    formato: "Número inteiro (ex.: 30)",
    regra: "Quantidade em estoque. Vazio vira 0 e substitui o estoque atual do produto já cadastrado.",
  },
  {
    coluna: "OBSERVAÇÕES",
    obrigatoria: false,
    formato: "Texto livre",
    regra: "Substância, nome de marca e nomes parecidos — a IA de atendimento usa isso na busca. Vazio apaga a observação já cadastrada.",
  },
];

/** Produtos fictícios: o prefixo "EXEMPLO -" evita que virem produto de verdade se alguém importar o modelo sem querer. */
export const LINHAS_EXEMPLO: (string | number)[][] = [
  [
    "EXEMPLO - Paracetamol 750mg 20 comprimidos",
    "Laboratório Exemplo",
    12.5,
    30,
    "Substância: paracetamol | Referência: Tylenol | Nomes parecidos: paracetamol, paracatamol, tylenol, acetaminofeno",
  ],
  ["EXEMPLO - Dipirona 500mg 10 comprimidos", "Laboratório Modelo", 6.9, 48, "Substância: dipirona | Referência: Novalgina | Nomes parecidos: dipirona, novalgina, metamizol"],
  ["EXEMPLO - Soro fisiológico 0,9% 500ml", "Laboratório Teste", 8, 15, ""],
];

/** Modelo em texto separado por TAB: cola direto no Excel, Google Planilhas ou numa conversa com IA. */
export function modeloComoTexto(): string {
  const linhas = [COLUNAS_MODELO as readonly (string | number)[], ...LINHAS_EXEMPLO];
  return linhas.map((l) => l.map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
}

/** Gera o arquivo .xlsx de exemplo (cabeçalhos corretos + produtos fictícios). */
export async function gerarModeloXlsx(): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx"); // só carrega a biblioteca quando alguém clica em baixar
  const planilha = XLSX.utils.aoa_to_sheet([COLUNAS_MODELO as unknown as string[], ...LINHAS_EXEMPLO]);

  // Preço e quantidade como NÚMERO de verdade (e não texto), com formato visível.
  LINHAS_EXEMPLO.forEach((_, i) => {
    const linha = i + 2;
    const preco = planilha[`C${linha}`];
    const qtd = planilha[`D${linha}`];
    if (preco) preco.z = "0.00";
    if (qtd) qtd.z = "0";
  });
  planilha["!cols"] = [{ wch: 44 }, { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 70 }];

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Estoque");
  return XLSX.write(livro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export const NOME_ARQUIVO_MODELO = "modelo-estoque-preco-bom.xlsx";

/** Prompt pronto para colar no ChatGPT, Claude ou outra IA junto com a planilha original. */
export function montarPromptIA(): string {
  const cabecalho = COLUNAS_MODELO.join(" | ");
  const exemplo = modeloComoTexto();

  return `Você vai preparar uma planilha de estoque de farmácia para importação no CRM da Farmácia Preço Bom. Vou enviar a planilha original de estoque (pode ser .xlsx, .xls, .csv ou PDF). Sua tarefa é reorganizar os dados dela no modelo oficial abaixo e entregar um arquivo novo, pronto para importar.

## MODELO OFICIAL (formato exigido pelo CRM)

Arquivo final: Excel moderno (.xlsx), com UMA aba (ou, se houver mais, os dados devem estar na PRIMEIRA aba). O CRM só lê a primeira aba.
Linha 1: cabeçalho, exatamente com estes 5 nomes, nesta ordem, em MAIÚSCULAS e com os acentos (copie letra por letra):

${cabecalho}

Da linha 2 em diante: um produto por linha. Sem títulos, sem linhas em branco no topo, sem células mescladas, sem totais, sem fórmulas, sem colunas extras.

### Regras de cada coluna
1. NOME (obrigatório) — texto. Nome do produto exatamente como está na planilha original (mesma grafia, concentração, apresentação). Linha sem nome é descartada pelo CRM.
2. LABORATÓRIO — texto. Laboratório/fabricante, se existir no original. Se não existir, deixe a célula vazia (não invente).
3. VENDA (PREÇO) (obrigatório) — NÚMERO, não texto. É o preço de VENDA ao cliente (não é custo). Use somente o número: sem "R$", sem espaços e sem ponto de milhar. Exemplos corretos: 12.5 ou 12,50 ou 1234,5. Errado: "R$ 12,50", "1.234,50". Grave a célula como número, com no máximo 2 casas decimais.
4. QUANTIDADE (obrigatório) — NÚMERO INTEIRO, sem texto e sem casas decimais. É a quantidade em estoque do original.
5. OBSERVAÇÕES — texto livre, opcional. Se o original tiver observações, mantenha. Se não tiver, deixe vazio (não invente). Se quiser sugerir substância ativa ou nome de marca, só faça se constar no original.

## COMO TRABALHAR

1. Leia a planilha original inteira e identifique TODOS os produtos. Reconheça as colunas pelo significado (por exemplo: Produto/Descrição → NOME; Fabricante/Marca → LABORATÓRIO; Preço de venda/PV → VENDA (PREÇO); Qtd/Saldo/Estoque → QUANTIDADE; Obs/Observação → OBSERVAÇÕES).
2. Preserve os nomes originais dos produtos, os preços de venda, as quantidades, os laboratórios e as observações. Só mude o formato (número no lugar de texto, tirar "R$", etc.), nunca o conteúdo.
3. NÃO invente medicamentos, preços, quantidades, laboratórios ou observações.
4. NÃO exclua produtos sem justificativa. Se houver linhas repetidas (mesmo nome), mantenha todas e liste-as no relatório — o CRM usa só a primeira de cada nome, e quem decide é o administrador.
5. Se a planilha original trouxer outras colunas (custo, código, validade, código de barras), NÃO as inclua: este modelo não lê essas colunas. Cite no relatório quais ficaram de fora.
6. Se o preço de VENDA ou a QUANTIDADE de algum produto não estiver no original, não chute: pare e me pergunte antes de gerar o arquivo, ou liste esses produtos no relatório. Atenção: no CRM, QUANTIDADE vazia vira 0 e substitui o estoque atual do produto já cadastrado; e LABORATÓRIO ou OBSERVAÇÕES vazios apagam o que já estava cadastrado.
7. Se o original só tem preço de custo e nenhum preço de venda, avise e pergunte; não use o custo como venda sem minha autorização.

## ENTREGA

- Gere o arquivo .xlsx para download com o nome estoque-para-importar.xlsx.
- Se você não conseguir gerar arquivos, escreva o resultado como tabela de texto separada por TAB (o mesmo formato do exemplo abaixo) para eu colar no Excel ou Google Planilhas e salvar como .xlsx. Não use CSV: o CRM não aceita CSV.
- Depois do arquivo, escreva um relatório curto com: total de produtos no original, total no arquivo novo (os dois números devem bater, ou explique a diferença), produtos sem preço ou sem quantidade, nomes repetidos e qualquer dúvida ou decisão que tomou.

## EXEMPLO DE COMO O ARQUIVO DEVE FICAR (produtos fictícios — não copie, use só como modelo de formato)

${exemplo}

Aguardo a planilha original.`;
}
