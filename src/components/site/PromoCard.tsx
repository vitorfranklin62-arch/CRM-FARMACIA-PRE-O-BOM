import Image from "next/image";
import { Pill } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ProdutoDestaque } from "@/types/site";
import { WhatsAppButton } from "./WhatsAppButton";

function calcularDesconto(precoVenda: number, precoPromocional: number): number {
  if (precoVenda <= 0) return 0;
  return Math.round(((precoVenda - precoPromocional) / precoVenda) * 100);
}

export function PromoCard({ produto, index }: { produto: ProdutoDestaque; index: number }) {
  const precoPor = produto.preco_promocional ?? produto.preco_venda;
  const temDesconto = produto.preco_promocional != null && produto.preco_promocional < produto.preco_venda;
  const desconto = temDesconto ? calcularDesconto(produto.preco_venda, produto.preco_promocional!) : 0;
  const rotacao = index % 2 === 0 ? "-rotate-6" : "rotate-6";

  return (
    <div
      data-reveal
      className="relative flex flex-col rounded-lg bg-site-amarelo-etiqueta pb-4 pt-7 shadow-card-md transition-transform duration-200 motion-safe:hover:-translate-y-1"
    >
      {/* furo da etiqueta */}
      <span
        aria-hidden
        className="absolute left-1/2 top-2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-site-azul-marinho"
      />

      {temDesconto && (
        <span
          aria-hidden
          className={`absolute -right-2 -top-2 z-10 flex h-14 w-14 ${rotacao} items-center justify-center rounded-full bg-site-vermelho-marca text-center text-sm font-extrabold leading-none text-white shadow`}
        >
          -{desconto}%
        </span>
      )}

      <div className="px-4">
        <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-md bg-white/50">
          {produto.imagem_url ? (
            <Image
              src={produto.imagem_url}
              alt={produto.nome}
              width={160}
              height={112}
              className="h-full w-full object-contain"
            />
          ) : (
            <Pill className="h-10 w-10 text-site-azul-marinho" aria-hidden />
          )}
        </div>

        <h3 className="font-site line-clamp-2 min-h-[2.5em] text-sm font-semibold text-site-grafite">
          {produto.nome}
        </h3>
        {produto.laboratorio && <p className="mt-0.5 text-xs text-site-grafite/60">{produto.laboratorio}</p>}

        <div className="mt-3">
          {temDesconto && (
            <p className="text-xs font-medium text-site-vermelho-off line-through">
              De {formatCurrency(produto.preco_venda)}
            </p>
          )}
          <p className="font-display text-2xl font-extrabold tabular-nums text-site-azul-marinho">
            {formatCurrency(precoPor)}
          </p>
        </div>

        <WhatsAppButton
          secao="promocoes"
          produto={{ id: produto.id, nome: produto.nome, preco: precoPor }}
          size="sm"
          className="mt-3 w-full"
        >
          Pedir no WhatsApp
        </WhatsAppButton>
      </div>

      {/* borda serrilhada */}
      <span
        aria-hidden
        className="absolute -bottom-1.5 left-0 h-3 w-full bg-[linear-gradient(135deg,#001976_50%,transparent_50%),linear-gradient(225deg,#001976_50%,transparent_50%)] bg-[length:12px_12px] bg-repeat-x bg-left-bottom"
      />
    </div>
  );
}
