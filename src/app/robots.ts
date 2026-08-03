import type { MetadataRoute } from "next";
import { loja } from "@/config/loja";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/pedidos",
        "/clientes",
        "/chat",
        "/campanhas",
        "/templates",
        "/produtos",
        "/configuracoes",
        "/auth",
        "/api",
      ],
    },
    sitemap: `${loja.siteUrl}/sitemap.xml`,
  };
}
