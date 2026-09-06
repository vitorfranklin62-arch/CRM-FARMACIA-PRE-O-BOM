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
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-brand-100 bg-gradient-to-r from-brand-50 via-white to-accent-50 dark:border-white/10 dark:from-navy-950 dark:via-navy-900 dark:to-navy-950 md:hidden">
      {items.map((item) => {
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
    </nav>
  );
}
