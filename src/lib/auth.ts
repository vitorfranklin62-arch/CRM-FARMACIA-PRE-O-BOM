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
