"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  MessageCircle,
  Users,
  Megaphone,
  FileText,
  Settings,
  Pill,
  Boxes,
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

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, donaOnly: true },
  { href: "/pedidos", label: "Pedidos", icon: Package },
  { href: "/chat", label: "Chat ao vivo", icon: MessageCircle },
  { href: "/produtos", label: "Produtos", icon: Boxes },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone, donaOnly: true },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/configuracoes", label: "Configurações", icon: Settings, donaOnly: true },
];

export function Sidebar({ role }: { role: UsuarioRole }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.donaOnly || role === "dona");

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-100 bg-white md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Pill size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-gray-900">Preço Bom</p>
          <p className="text-xs leading-tight text-gray-400">Painel CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
