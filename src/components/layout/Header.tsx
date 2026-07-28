import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth/login/actions";
import { initials } from "@/lib/utils";
import type { Usuario } from "@/types/database";

export function Header({ usuario, title }: { usuario: Usuario; title?: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white/80 px-4 py-3.5 backdrop-blur md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <span className="text-sm font-semibold text-gray-900">Preço Bom</span>
      </div>
      {title && <h1 className="hidden text-lg font-semibold text-gray-900 md:block">{title}</h1>}

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight text-gray-900">{usuario.nome}</p>
          <p className="text-xs capitalize leading-tight text-gray-400">{usuario.role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50 text-sm font-semibold text-navy-900">
          {initials(usuario.nome)}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            title="Sair"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
