/**
 * Agrupa itens pela chave informada e devolve só os grupos com mais de um
 * item. Dentro de cada grupo o mais recente (pela data) vem primeiro — é o
 * "sobrevivente" nas rotinas de limpeza de duplicados.
 */
export function agruparDuplicados<T>(
  itens: T[],
  chaveDe: (item: T) => string,
  dataDe: (item: T) => string
): T[][] {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDe(item);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(item);
    else grupos.set(chave, [item]);
  }

  const duplicados = Array.from(grupos.values()).filter((g) => g.length > 1);
  for (const g of duplicados) {
    g.sort((a, b) => new Date(dataDe(b)).getTime() - new Date(dataDe(a)).getTime());
  }
  return duplicados;
}
