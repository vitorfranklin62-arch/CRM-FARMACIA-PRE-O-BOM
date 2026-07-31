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
