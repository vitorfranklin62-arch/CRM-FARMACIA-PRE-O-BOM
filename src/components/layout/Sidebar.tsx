"use client";

import { useEffect, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/Logo";
import type { UsuarioRole } from "@/types/database";

const STORAGE_KEY = "precobom-sidebar-recolhida";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  donaOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, donaOnly: true },
  { href: "/pedidos", label: "Pedidos", icon: Package },
  { href: "/encomendas", label: "Encomendas", icon: PackageSearch },
  { href: "/chat", label: "Chat ao vivo", icon: MessageCircle },
  { href: "/produtos", label: "Produtos", icon: Boxes },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone, donaOnly: true },
  { href: "/vitrine", label: "Vitrine", icon: Store, donaOnly: true },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/configuracoes", label: "Configurações", icon: Settings, donaOnly: true },
];

export function Sidebar({ role }: { role: UsuarioRole }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.donaOnly || role === "dona");
  const [recolhida, setRecolhida] = useState(false);

  // Lê a preferência salva só depois de montar (evita divergir do HTML
  // renderizado no servidor, que sempre começa expandido).
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setRecolhida(true);
  }, []);

  function alternar() {
    setRecolhida((atual) => {
      const proximo = !atual;
      localStorage.setItem(STORAGE_KEY, proximo ? "1" : "0");
      return proximo;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col bg-navy-900 transition-[width] duration-200 md:flex",
        recolhida ? "w-[68px]" : "w-60"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-white/10 px-5 py-5",
          recolhida && "justify-center px-0"
        )}
      >
        <LogoMark size={34} />
        {!recolhida && (
          <div>
            <p className="text-[13px] font-semibold leading-tight tracking-wide text-white">Preço Bom</p>
            <p className="text-[10.5px] leading-tight text-white/60">Painel CRM</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={recolhida ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-[13.5px] font-medium transition",
                recolhida && "justify-center px-0",
                active
                  ? "border-accent-500 bg-accent-500/15 font-semibold text-white"
                  : "border-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!recolhida && item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={alternar}
        title={recolhida ? "Expandir menu" : "Recolher menu"}
        className={cn(
          "flex items-center gap-2 border-t border-white/10 px-3 py-3 text-[13px] font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white",
          recolhida && "justify-center px-0"
        )}
      >
        {recolhida ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        {!recolhida && "Recolher"}
      </button>
    </aside>
  );
}
