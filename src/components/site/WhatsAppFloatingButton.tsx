"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { gerarLinkWhatsApp } from "@/lib/whatsapp";
import { registrarEventoSite } from "@/lib/site-telemetria";

export function WhatsAppFloatingButton() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const sentinela = document.getElementById("hero-sentinela");
    if (!sentinela) {
      setVisivel(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setVisivel(!entry.isIntersecting), {
      rootMargin: "-64px 0px 0px 0px",
    });
    observer.observe(sentinela);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href={gerarLinkWhatsApp({ secao: "flutuante" })}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => registrarEventoSite({ tipo: "clique_whatsapp", secao: "flutuante" })}
      aria-label="Chamar no WhatsApp"
      className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-site-whatsapp text-white shadow-lg transition-all duration-300 motion-reduce:transition-none motion-safe:hover:scale-105 md:hidden ${
        visivel ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <MessageCircle className="h-7 w-7" aria-hidden />
    </a>
  );
}
