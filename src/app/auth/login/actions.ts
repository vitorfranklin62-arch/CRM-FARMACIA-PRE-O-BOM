"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export interface LoginState {
  error: string | null;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const limited = rateLimit(`login:${ip}`, { limit: 10, windowMs: 5 * 60 * 1000 });
  if (!limited.success) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Informe um e-mail e senha válidos." };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  await logLoginAttempt(email, !error, ip);

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  redirect("/");
}

async function logLoginAttempt(email: string, sucesso: boolean, ip: string) {
  try {
    const service = createServiceClient();
    await service.from("login_tentativas").insert({ email, sucesso, ip });
  } catch {
    // não bloquear o login por falha ao registrar auditoria
  }
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
