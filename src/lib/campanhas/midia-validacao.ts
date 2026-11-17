/**
 * Conferências puras da imagem de campanha (sem banco nem Storage), usadas
 * pelo servidor em src/lib/campanhas/midia.ts e pelos testes automáticos.
 */

const CAMINHO_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

export function caminhoDeImagemValido(caminho: unknown): caminho is string {
  return typeof caminho === "string" && CAMINHO_VALIDO.test(caminho);
}

/**
 * Confere a "assinatura" do arquivo (os primeiros bytes). O tipo que o
 * navegador informa no upload não prova nada — um .exe renomeado pra .jpg
 * chega dizendo "image/jpeg". Devolve o tipo real ou null.
 */
export function tipoRealDaImagem(bytes: ArrayBuffer | Uint8Array): "image/jpeg" | "image/png" | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return "image/png";
  return null;
}
