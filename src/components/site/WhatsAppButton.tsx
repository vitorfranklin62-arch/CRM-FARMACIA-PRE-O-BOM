"use client";

import { MessageCircle } from "lucide-react";
import { gerarLinkWhatsApp } from "@/lib/whatsapp";
import { registrarEventoSite } from "@/lib/site-telemetria";
import { cn } from "@/lib/utils";
import type { ProdutoDestaque, SecaoSite } from "@/types/site";

interface WhatsAppButtonProps {
  secao: SecaoSite;
  produto?: Pick<ProdutoDestaque, "id" | "nome"> & { preco?: number };
  termoBusca?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const tamanhos = {
  sm: "px-3 py-2 text-sm gap-1.5",
  md: "px-5 py-3 text-base gap-2",
  lg: "px-7 py-4 text-lg gap-2.5",
};

export function WhatsAppButton({ secao, produto, termoBusca, children, className, size = "md" }: WhatsAppButtonProps) {
  const href = gerarLinkWhatsApp({ produto, termoBusca, secao });

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        registrarEventoSite({ tipo: "clique_whatsapp", produtoId: produto?.id, secao, termo: termoBusca })
      }
      aria-label={typeof children === "string" ? children : "Chamar no WhatsApp"}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center rounded-full bg-site-whatsapp font-semibold text-white shadow-card-md transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
        tamanhos[size],
        className
      )}
    >
      <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
      {children}
    </a>
  );
}
