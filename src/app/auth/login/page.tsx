"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Lock, Mail } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent-500 py-2.5 font-medium text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F6FA] px-4 dark:bg-[#0A0F1E]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 shadow-lg shadow-navy-900/20">
            <LogoMark size={38} />
          </div>
          <h1 className="text-xl font-bold uppercase tracking-wide text-navy-900 dark:text-white">
            Farmácia Preço Bom
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Painel de atendimento</p>
        </div>

        <form
          action={formAction}
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card dark:border-white/10 dark:bg-[#11172A]"
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                E-mail
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                  size={18}
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-400 dark:focus:ring-brand-500/20"
                  placeholder="voce@farmaciaprecobom.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Senha
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                  size={18}
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-400 dark:focus:ring-brand-500/20"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {state.error && (
              <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                {state.error}
              </p>
            )}

            <SubmitButton />
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Acesso restrito à equipe da Farmácia Preço Bom.
        </p>
      </div>
    </div>
  );
}
