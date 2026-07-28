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
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/Logo";
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
    <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 md:flex">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5">
        <LogoMark size={34} />
        <div>
          <p className="text-[13px] font-semibold leading-tight tracking-wide text-white">Preço Bom</p>
          <p className="text-[10.5px] leading-tight text-white/60">Painel CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-[13.5px] font-medium transition",
                active
                  ? "border-accent-500 bg-accent-500/15 font-semibold text-white"
                  : "border-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"
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
