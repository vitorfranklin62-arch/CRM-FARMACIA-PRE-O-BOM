/**
 * O Supabase/PostgREST só devolve até 1000 linhas por padrão em qualquer
 * `select`, mesmo sem `.limit()` — silenciosamente, sem erro. Com catálogos
 * grandes (produtos > 1000), isso cortava a lista de produtos na tela e,
 * pior, fazia a importação de estoque "esquecer" dos produtos além da
 * linha 1000 e tratá-los como novos (duplicando o catálogo). Essa função
 * busca em páginas de 1000 até não sobrar mais nada.
 */
export async function selecionarTodos<T>(
  buscarPagina: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const TAMANHO_PAGINA = 1000;
  const todos: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buscarPagina(from, from + TAMANHO_PAGINA - 1);
    if (error) return { data: todos, error };
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < TAMANHO_PAGINA) break;
    from += TAMANHO_PAGINA;
  }

  return { data: todos, error: null };
}
