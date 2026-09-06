import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth/login/actions";
import { initials } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { Usuario } from "@/types/database";

export function Header({ usuario, title }: { usuario: Usuario; title?: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-brand-100/70 bg-gradient-to-r from-brand-50/80 via-white/85 to-accent-50/60 px-4 py-3.5 backdrop-blur dark:border-white/10 dark:from-navy-950/85 dark:via-navy-900/80 dark:to-navy-950/85 md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <span className="titulo-gradiente text-sm font-bold">Preço Bom</span>
      </div>
      {title && <h1 className="hidden text-lg font-semibold text-gray-900 dark:text-white md:block">{title}</h1>}

      <div className="ml-auto flex items-center gap-3">
        <NotificationBell />
        <ThemeToggle />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight text-gray-900 dark:text-white">{usuario.nome}</p>
          <p className="text-xs capitalize leading-tight text-gray-400 dark:text-gray-500">{usuario.role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradiente-marca text-sm font-semibold text-white shadow-brilho-marca">
          {initials(usuario.nome)}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            title="Sair"
            className="rounded-xl p-2 text-gray-400 transition hover:bg-accent-50 hover:text-accent-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-accent-300"
          >
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
