/** Login FALSO pros testes das rotas: troque `sessao.papel` pra simular quem está logado. */
export const sessao: { papel: "dona" | "funcionaria" | null } = { papel: "dona" };

const DONA = { id: "00000000-0000-0000-0000-0000000000d1", role: "dona", ativo: true };

/** Igual ao de verdade: sem permissão, o Next interrompe a requisição (redirect lança erro). */
export async function requireUser() {
  if (!sessao.papel) throw new Error("NEXT_REDIRECT /auth/login");
  return { ...DONA, role: sessao.papel };
}

export async function requireDona() {
  const usuario = await requireUser();
  if (usuario.role !== "dona") throw new Error("NEXT_REDIRECT /pedidos");
  return usuario;
}
