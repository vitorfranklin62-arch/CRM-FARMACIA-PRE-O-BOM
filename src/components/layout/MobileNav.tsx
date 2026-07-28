"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, MessageCircle, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsuarioRole } from "@/types/database";

const ITEMS = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard, donaOnly: true },
  { href: "/pedidos", label: "Pedidos", icon: Package },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/configuracoes", label: "Config", icon: Settings, donaOnly: true },
];

export function MobileNav({ role }: { role: UsuarioRole }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => !item.donaOnly || role === "dona");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-100 bg-white md:hidden">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
              active ? "text-accent-600" : "text-gray-400"
            )}
          >
            <Icon size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
