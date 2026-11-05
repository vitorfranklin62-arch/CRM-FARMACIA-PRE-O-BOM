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
 * Número digitado à mão no painel (ex.: "(71) 99937-3863") → formato que o
 * WhatsApp/uazapi espera: só dígitos, com o código do país. Número brasileiro
 * sem o 55 (10 ou 11 dígitos, DDD + número) ganha o 55 na frente; número
 * digitado com "+" já traz o código do país e fica como está.
 * Devolve null se não parecer um telefone válido.
 */
export function telefoneParaWhatsapp(telefone: string): string | null {
  const digitos = normalizarTelefone(telefone).replace(/^0+/, "");
  const jaTemPais = telefone.trim().startsWith("+");
  const comPais = !jaTemPais && (digitos.length === 10 || digitos.length === 11) ? `55${digitos}` : digitos;
  // Brasileiro com 55 tem 12 ou 13 dígitos; de outro país (com "+") aceita a partir de 10.
  return comPais.length >= (jaTemPais ? 10 : 12) && comPais.length <= 15 ? comPais : null;
}

/**
 * Telefone pra mostrar na tela: "5571999373863" → "(71) 99937-3863".
 * Número de outro país (ou formato inesperado) aparece com "+" e os dígitos.
 */
export function formatarTelefone(telefone: string | null | undefined): string {
  if (!telefone) return "-";
  const digitos = normalizarTelefone(telefone);
  const nacional = digitos.length === 12 || digitos.length === 13 ? digitos.replace(/^55/, "") : digitos;
  if (nacional.length === 11) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  if (nacional.length === 10) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  return digitos ? `+${digitos}` : telefone;
}

/**
 * Formas em que o MESMO número brasileiro pode estar salvo: com/sem 55 e
 * com/sem o 9º dígito (o WhatsApp entrega números antigos sem o 9). Mesma
 * regra da função `variantes_telefone_br` do banco.
 */
export function variantesTelefoneBr(telefone: string): string[] {
  const d = normalizarTelefone(telefone);
  if (!d) return [];
  const v = new Set([d]);
  const nacional = (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
  if (nacional.length !== 10 && nacional.length !== 11) return Array.from(v);
  v.add(nacional).add(`55${nacional}`);
  if (nacional.length === 11 && nacional[2] === "9") {
    const sem9 = nacional.slice(0, 2) + nacional.slice(3);
    v.add(sem9).add(`55${sem9}`);
  } else if (nacional.length === 10 && "6789".includes(nacional[2])) {
    const com9 = `${nacional.slice(0, 2)}9${nacional.slice(2)}`;
    v.add(com9).add(`55${com9}`);
  }
  return Array.from(v);
}
