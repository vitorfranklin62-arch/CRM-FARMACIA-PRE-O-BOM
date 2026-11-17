import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
const SUBSTITUTOS = {
  "@/lib/supabase/server": "tests/apoio/supabase-falso.ts",
  "@/lib/auth": "tests/apoio/auth-falso.ts",
};

export async function resolve(especificador, contexto, proximo) {
  if (especificador.startsWith("@/")) {
    const substituto = SUBSTITUTOS[especificador];
    if (substituto) return proximo(pathToFileURL(raiz + substituto).href, contexto);
    const base = raiz + "src/" + especificador.slice(2);
    for (const candidato of [base + ".ts", base + ".tsx", base + "/index.ts"]) {
      if (existsSync(candidato)) return proximo(pathToFileURL(candidato).href, contexto);
    }
  }
  // "next/server" não declara "exports"; no modo ESM do Node precisa do .js.
  if (/^next\/[a-z-]+$/.test(especificador)) return proximo(`${especificador}.js`, contexto);
  return proximo(especificador, contexto);
}
