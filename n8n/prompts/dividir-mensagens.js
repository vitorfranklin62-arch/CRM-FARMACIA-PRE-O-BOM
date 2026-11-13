// Divide a resposta da IA em balões do WhatsApp (linha em branco = novo balão)
// e limpa vícios que denunciam robô. A regra principal está no prompt; isto é
// só uma rede de segurança. No máximo 3 balões: o excedente vai junto no último.
// Cópia oficial: n8n/prompts/dividir-mensagens.js (testes em tests/dividir-mensagens.test.ts).
const MAX_BALOES = 3;
const NOME = '(?:,\\s*[A-ZÀ-Ý][a-zà-ÿ]+(?:\\s+[A-ZÀ-Ý][a-zà-ÿ]+)?)?';
// "Perfeito!", "Ótimo, Cláudia 😊", "Entendi." no começo do balão (muleta de IA).
const MULETA = new RegExp('^(?:Perfeito|Ótimo|Ótima|Entendi)' + NOME + '(?:\\s*[!.,]+|\\s*(?=\\p{Extended_Pictographic})|\\s*$)\\s*', 'u');
// Balão que é SÓ concordância ("Beleza, Marcos 😄", "Certo!"): sai se houver outros balões.
const SO_CONCORDA = new RegExp('^(?:Beleza|Certo|Certinho|Tá certo|Show|Combinado|Ok|Opa|Oba|Massa)' + NOME + '\\s*[!.,]*\\s*[\\p{Extended_Pictographic}\\uFE0F\\s]*$', 'u');
// "LOSARTANA POTASSICA EMS" -> "Losartana potassica EMS" (nome de produto copiado do cadastro).
const suavizarMaiusculas = (s) => s.replace(/\b[A-ZÀ-Ý0-9]{2,}(?:[ \/.-]+[A-ZÀ-Ý0-9]{2,})+\b/g, (trecho) => {
  if (!/[A-ZÀ-Ý]{4,}/.test(trecho)) return trecho; // siglas curtas (CNPJ 123, SP) ficam como estão
  let primeira = true;
  return trecho.replace(/[A-ZÀ-Ý0-9]+/g, (p) => {
    let r = /\d/.test(p) || p.length > 3 ? p.toLowerCase() : p; // EMS, GE continuam em maiúscula
    if (primeira && /^[a-zà-ÿ]/.test(r)) r = r.charAt(0).toUpperCase() + r.slice(1);
    primeira = false;
    return r;
  });
});
const limpar = (t) => {
  let s = t
    .replace(/\*\*(.+?)\*\*/g, '*$1*')   // **negrito** vira *negrito* (padrão do WhatsApp)
    .replace(/^#{1,6}\s+/gm, '')          // títulos de markdown
    .replace(/\s+—\s+/g, ', ')            // travessão no meio da frase vira vírgula
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  s = suavizarMaiusculas(s.replace(MULETA, ''));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
let partes = String($input.first().json.output || '')
  .split(/\n\s*\n/)
  .map(limpar)
  .filter(p => /\p{L}|\d/u.test(p)); // descarta balão que sobrou só com emoji/pontuação
if (partes.length > 1) {
  const semConcordancia = partes.filter(p => !SO_CONCORDA.test(p));
  if (semConcordancia.length > 0) partes = semConcordancia;
}
if (partes.length === 0) partes = [String($input.first().json.output || '').trim()].filter(Boolean);
if (partes.length > MAX_BALOES) {
  partes = [...partes.slice(0, MAX_BALOES - 1), partes.slice(MAX_BALOES - 1).join('\n')];
}
// delay_ms = tempo de "digitando..." na uazapi, proporcional ao tamanho do balão.
return partes.map(texto => ({ json: { texto, delay_ms: Math.min(6000, Math.max(1500, texto.length * 45)) } }));
