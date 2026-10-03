/**
 * Normaliza telefone pra comparar/gravar de forma consistente: mantém só
 * os dígitos. Sem isso, o mesmo contato podia virar dois clientes/conversas
 * diferentes no CRM se o N8N mandasse o número formatado de jeitos
 * diferentes entre uma chamada e outra (com "+", espaço, traço, ou até o
 * sufixo do WhatsApp tipo "@s.whatsapp.net" colado no número).
 */
export function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/**
 * Chave de comparação de telefone brasileiro: tira o "55" do país e o "9" extra
 * do celular (DDD + 9 + 8 dígitos vira DDD + 8 dígitos). O WhatsApp às vezes
 * entrega o mesmo número com o 9 e às vezes sem, e o cadastro do CRM pode ter
 * vindo de outro lugar (campanha, cadastro manual) no outro formato — sem isso
 * a mesma pessoa vira dois clientes e o bloqueio da IA não encontra ninguém.
 * Mesma regra de `telefone_chave_br` no banco e das chaves de bloqueio no N8N.
 */
export function chaveTelefoneBR(telefone: string): string {
  let digitos = normalizarTelefone(telefone);
  if (digitos.length >= 12 && digitos.startsWith("55")) digitos = digitos.slice(2);
  if (digitos.length === 11 && digitos[2] === "9") digitos = digitos.slice(0, 2) + digitos.slice(3);
  return digitos;
}

/**
 * Todas as formas em que o mesmo número brasileiro pode estar gravado em
 * `clientes.telefone` (só dígitos): com/sem "55" e com/sem o 9 do celular.
 * Número que não parece brasileiro volta como veio, sem inventar variações.
 */
export function candidatosTelefone(telefone: string): string[] {
  const original = normalizarTelefone(telefone);
  const chave = chaveTelefoneBR(telefone);
  if (chave.length !== 10) return [original];

  const ddd = chave.slice(0, 2);
  const local = chave.slice(2);
  const variantes = new Set<string>([original, chave, `55${chave}`]);
  // Só celular antigo (8 dígitos começando em 6–9) ganha o 9 na frente —
  // telefone fixo (começa em 2–5) nunca vira celular.
  if (/^[6-9]/.test(local)) {
    variantes.add(`${ddd}9${local}`);
    variantes.add(`55${ddd}9${local}`);
  }
  return Array.from(variantes);
}
