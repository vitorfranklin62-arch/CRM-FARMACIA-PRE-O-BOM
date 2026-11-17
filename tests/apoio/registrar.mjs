// Usado só pelos testes (npm test): ensina o Node a achar os imports "@/..."
// do projeto e troca o cliente do Supabase por um banco em memória.
import { register } from "node:module";

register("./alias.mjs", import.meta.url);
