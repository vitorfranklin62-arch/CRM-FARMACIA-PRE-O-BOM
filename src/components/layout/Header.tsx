import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth/login/actions";
import { initials } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { Usuario } from "@/types/database";

export function Header({ usuario, title }: { usuario: Usuario; title?: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white/80 px-4 py-3.5 backdrop-blur dark:border-white/10 dark:bg-navy-950/80 md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Preço Bom</span>
      </div>
      {title && <h1 className="hidden text-lg font-semibold text-gray-900 dark:text-white md:block">{title}</h1>}

      <div className="ml-auto flex items-center gap-3">
        <NotificationBell />
        <ThemeToggle />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight text-gray-900 dark:text-white">{usuario.nome}</p>
          <p className="text-xs capitalize leading-tight text-gray-400 dark:text-gray-500">{usuario.role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50 text-sm font-semibold text-navy-900 dark:bg-white/10 dark:text-white">
          {initials(usuario.nome)}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            title="Sair"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
