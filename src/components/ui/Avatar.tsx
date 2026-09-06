"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";

/**
 * Paleta das iniciais. A cor sai do nome (hash simples), então o mesmo cliente
 * aparece sempre com a mesma cor em todas as telas.
 */
const GRADIENTES = [
  "bg-gradient-to-br from-brand-400 to-brand-600",
  "bg-gradient-to-br from-violet-400 to-fuchsia-600",
  "bg-gradient-to-br from-emerald-400 to-teal-600",
  "bg-gradient-to-br from-amber-400 to-orange-500",
  "bg-gradient-to-br from-sky-400 to-blue-600",
  "bg-gradient-to-br from-rose-400 to-accent-600",
  "bg-gradient-to-br from-cyan-400 to-indigo-500",
  "bg-gradient-to-br from-lime-400 to-emerald-600",
] as const;

function gradienteDoNome(nome: string) {
  let soma = 0;
  for (let i = 0; i < nome.length; i++) soma = (soma + nome.charCodeAt(i)) % 997;
  return GRADIENTES[soma % GRADIENTES.length];
}

export function Avatar({
  nome,
  fotoUrl,
  size = 36,
  className,
  comAnel = false,
}: {
  nome: string;
  fotoUrl?: string | null;
  size?: number;
  className?: string;
  /** Anel colorido em volta da foto (usado nas listas de conversa). */
  comAnel?: boolean;
}) {
  const [falhou, setFalhou] = useState(false);
  const mostrarFoto = Boolean(fotoUrl) && !falhou;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-sm",
        gradienteDoNome(nome),
        comAnel && "ring-2 ring-white ring-offset-1 ring-offset-brand-100 dark:ring-navy-800 dark:ring-offset-navy-900",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.32) }}
    >
      {mostrarFoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto vem de domínio externo (WhatsApp/Instagram via UAIZAP), não dá pra usar next/image sem saber os domínios de antemão
        <img
          src={fotoUrl!}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(true)}
        />
      ) : (
        initials(nome)
      )}
    </div>
  );
}
