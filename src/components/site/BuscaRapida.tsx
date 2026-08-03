"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { registrarEventoSite } from "@/lib/site-telemetria";
import { WhatsAppButton } from "./WhatsAppButton";
import { PromoCard } from "./PromoCard";
import type { ProdutoDestaque } from "@/types/site";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function BuscaRapida({ produtos }: { produtos: ProdutoDestaque[] }) {
  const [termo, setTermo] = useState("");

  const resultados = useMemo(() => {
    const busca = normalizar(termo.trim());
    if (!busca) return [];
    return produtos.filter(
      (p) => normalizar(p.nome).includes(busca) || (p.principio_ativo && normalizar(p.principio_ativo).includes(busca))
    );
  }, [termo, produtos]);

  useEffect(() => {
    const busca = termo.trim();
    if (busca.length < 2) return;
    const timeout = setTimeout(() => {
      registrarEventoSite({ tipo: "busca", secao: "promocoes", termo: busca });
    }, 600);
    return () => clearTimeout(timeout);
  }, [termo]);

  const semResultado = termo.trim().length >= 2 && resultados.length === 0;

  return (
    <section className="bg-site-nuvem py-14 font-site md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <h2 className="font-display text-2xl font-extrabold text-site-azul-marinho md:text-3xl">
          Procurando algum remédio?
        </h2>

        <div className="relative mt-5 max-w-lg">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-site-grafite/40" aria-hidden />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome do remédio ou princípio ativo"
            aria-label="Procurar remédio no catálogo de destaques"
            className="min-h-[44px] w-full rounded-full border border-site-grafite/15 bg-white py-3 pl-11 pr-4 text-site-grafite shadow-sm outline-none focus:border-site-azul-marinho focus:ring-2 focus:ring-site-azul-marinho/30"
          />
        </div>

        {resultados.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {resultados.map((produto, index) => (
              <PromoCard key={produto.id} produto={produto} index={index} />
            ))}
          </div>
        )}

        {semResultado && (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-card">
            <p className="text-site-grafite">
              Não achou <strong>&ldquo;{termo.trim()}&rdquo;</strong>? Pergunte no WhatsApp que a gente verifica o
              estoque.
            </p>
            <WhatsAppButton secao="promocoes" termoBusca={termo.trim()} className="mt-4">
              Perguntar no WhatsApp
            </WhatsAppButton>
          </div>
        )}
      </div>
    </section>
  );
}
