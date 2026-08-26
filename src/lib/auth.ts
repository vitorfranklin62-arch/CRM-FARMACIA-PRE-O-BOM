import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Usuario } from "@/types/database";

/** Usuário autenticado + perfil da tabela `usuarios`. Redireciona pro login se não houver sessão. */
export async function requireUser(): Promise<Usuario> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!usuario || !usuario.ativo) redirect("/auth/login");

  return usuario;
}

/** Igual a requireUser, mas redireciona pra fora se o usuário não for a dona. */
export async function requireDona(): Promise<Usuario> {
  const usuario = await requireUser();
  if (usuario.role !== "dona") redirect("/pedidos");
  return usuario;
}

/**
 * Versão de `requireUser` para rotas de API (`src/app/api/*`).
 *
 * `requireUser` chama `redirect()`, que numa rota de API vira uma resposta 307
 * para /auth/login — o `fetch()` do navegador segue esse redirect, recebe o
 * HTML da tela de login e o `res.json()` do front quebra com um erro genérico.
 * Aqui devolvemos `null` para a rota poder responder um 401 em JSON.
 */
export async function getUsuarioApi(): Promise<Usuario | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!usuario || !usuario.ativo) return null;

  return usuario;
}
