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
      className="w-full rounded-xl bg-gradiente-acento py-2.5 font-semibold text-white shadow-brilho-acento transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradiente-marca shadow-brilho-marca">
            <LogoMark size={38} />
          </div>
          <div className="text-center leading-tight">
            <p className="text-[13px] font-semibold uppercase tracking-[0.25em] text-navy-500 dark:text-white/60">
              Farmácia
            </p>
            <h1 className="text-2xl font-extrabold uppercase tracking-wide text-navy-900 dark:text-white">
              Preço Bom
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Painel de atendimento</p>
        </div>

        <form
          action={formAction}
          className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/90 p-6 shadow-card-md backdrop-blur-sm dark:border-white/10 dark:bg-[#11172A]/90"
        >
          <span aria-hidden className="faixa-arcoiris absolute inset-x-0 top-0 h-1" />
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
                  className="w-full rounded-xl border border-brand-200/70 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-400 dark:focus:ring-brand-500/25"
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
                  className="w-full rounded-xl border border-brand-200/70 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-400 dark:focus:ring-brand-500/25"
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
