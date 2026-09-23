"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  PackageSearch,
  MessageCircle,
  Users,
  Megaphone,
  FileText,
  Settings,
  Boxes,
  Store,
  LayoutGrid,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsuarioRole } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  donaOnly?: boolean;
}

// Mesmas seções da sidebar do desktop — no celular, as 4 primeiras ficam
// fixas na barra e o resto entra no atalho "Mais", pra nenhuma tela ficar
// inacessível fora do computador.
const TODOS_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard, donaOnly: true },
  { href: "/pedidos", label: "Pedidos", icon: Package },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/encomendas", label: "Encomendas", icon: PackageSearch },
  { href: "/produtos", label: "Produtos", icon: Boxes },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone, donaOnly: true },
  { href: "/vitrine", label: "Vitrine", icon: Store, donaOnly: true },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/configuracoes", label: "Configurações", icon: Settings, donaOnly: true },
];

const FIXOS = ["/dashboard", "/pedidos", "/chat", "/clientes"];

export function MobileNav({ role }: { role: UsuarioRole }) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);

  const items = TODOS_ITEMS.filter((item) => !item.donaOnly || role === "dona");
  const barraItems = items.filter((item) => FIXOS.includes(item.href));
  const maisItems = items.filter((item) => !FIXOS.includes(item.href));

  const emAlgumMaisItem = maisItems.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <>
      {maisAberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMaisAberto(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-brand-100 bg-white p-4 pb-6 shadow-xl dark:border-white/10 dark:bg-navy-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="titulo-gradiente text-sm font-bold">Mais opções</h2>
              <button
                onClick={() => setMaisAberto(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {maisItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMaisAberto(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border border-brand-100/70 px-2 py-3 text-center text-[11px] font-medium transition dark:border-white/10",
                      active
                        ? "bg-gradiente-acento text-white shadow-brilho-acento"
                        : "text-gray-500 hover:bg-brand-50 dark:text-gray-300 dark:hover:bg-white/10"
                    )}
                  >
                    <Icon size={20} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-brand-100 bg-gradient-to-r from-brand-50 via-white to-accent-50 pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:from-navy-950 dark:via-navy-900 dark:to-navy-950 md:hidden">
        {barraItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
                active ? "font-semibold text-accent-600 dark:text-accent-300" : "text-gray-400 dark:text-gray-500"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition",
                  active && "bg-gradiente-acento text-white shadow-brilho-acento"
                )}
              >
                <Icon size={20} />
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMaisAberto(true)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
            emAlgumMaisItem ? "font-semibold text-accent-600 dark:text-accent-300" : "text-gray-400 dark:text-gray-500"
          )}
        >
          <span
            className={cn(
              "flex h-7 w-12 items-center justify-center rounded-full transition",
              emAlgumMaisItem && "bg-gradiente-acento text-white shadow-brilho-acento"
            )}
          >
            <LayoutGrid size={20} />
          </span>
          Mais
        </button>
      </nav>
    </>
  );
}
