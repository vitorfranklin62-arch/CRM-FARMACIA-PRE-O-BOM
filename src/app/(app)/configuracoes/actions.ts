"use server";

import { revalidatePath } from "next/cache";
import { requireDona } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { usuarioCreateSchema, senhaUpdateSchema } from "@/lib/validation";

const CONFIG_KEYS = [
  "farmacia_nome",
  "farmacia_telefone",
  "farmacia_horario",
  "integracao_uaizap_url",
  "integracao_n8n_url",
  "integracao_n8n_chat_webhook_url",
  "integracao_n8n_campanha_webhook_url",
] as const;

export interface ActionState {
  error: string | null;
  success?: boolean;
}

export async function updateConfiguracoesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const dona = await requireDona();
  const supabase = await createClient();

  const rows = CONFIG_KEYS.filter((key) => formData.has(key)).map((key) => ({
    chave: key,
    valor: String(formData.get(key) ?? ""),
    tipo: "string" as const,
  }));

  if (rows.length === 0) return { error: null, success: true };

  const { error } = await supabase.from("configuracoes").upsert(rows, { onConflict: "chave" });
  if (error) return { error: "Não foi possível salvar as configurações." };

  await logAudit(supabase, "configuracoes_atualizadas", "configuracoes", null, { chaves: rows.map((r) => r.chave) }, dona.id);

  revalidatePath("/configuracoes");
  return { error: null, success: true };
}

export async function criarUsuarioAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const dona = await requireDona();

  const parsed = usuarioCreateSchema.safeParse({
    email: formData.get("email"),
    nome: formData.get("nome"),
    role: formData.get("role"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: "Preencha os dados do usuário corretamente (senha com 8+ caracteres)." };

  const service = createServiceClient();
  const { data: created, error: authError } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    return { error: authError?.message === "User already registered" ? "Já existe um usuário com esse e-mail." : "Não foi possível criar o usuário." };
  }

  const { error: dbError } = await service.from("usuarios").insert({
    id: created.user.id,
    email: parsed.data.email,
    nome: parsed.data.nome,
    role: parsed.data.role,
  });

  if (dbError) {
    await service.auth.admin.deleteUser(created.user.id);
    return { error: "Não foi possível salvar o perfil do usuário." };
  }

  await logAudit(service, "usuario_criado", "usuarios", created.user.id, { email: parsed.data.email, role: parsed.data.role }, dona.id);

  revalidatePath("/configuracoes");
  return { error: null, success: true };
}

export async function alternarAtivoUsuarioAction(usuarioId: string, ativo: boolean) {
  const dona = await requireDona();
  const supabase = await createClient();
  await supabase.from("usuarios").update({ ativo }).eq("id", usuarioId);
  await logAudit(supabase, "usuario_status_alterado", "usuarios", usuarioId, { ativo }, dona.id);
  revalidatePath("/configuracoes");
}

export async function removerUsuarioAction(usuarioId: string) {
  const dona = await requireDona();
  if (usuarioId === dona.id) return;

  const service = createServiceClient();
  await service.from("usuarios").delete().eq("id", usuarioId);
  await service.auth.admin.deleteUser(usuarioId);
  await logAudit(service, "usuario_removido", "usuarios", usuarioId, undefined, dona.id);
  revalidatePath("/configuracoes");
}

export async function alterarSenhaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const usuario = await requireDona();

  const parsed = senhaUpdateSchema.safeParse({
    senhaAtual: formData.get("senhaAtual"),
    novaSenha: formData.get("novaSenha"),
  });

  if (!parsed.success) return { error: "Senha atual e nova senha (8+ caracteres) são obrigatórias." };

  const supabase = await createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: usuario.email,
    password: parsed.data.senhaAtual,
  });

  if (reauthError) return { error: "Senha atual incorreta." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.novaSenha });
  if (error) return { error: "Não foi possível alterar a senha." };

  await logAudit(supabase, "senha_alterada", "usuarios", usuario.id, undefined, usuario.id);

  return { error: null, success: true };
}
