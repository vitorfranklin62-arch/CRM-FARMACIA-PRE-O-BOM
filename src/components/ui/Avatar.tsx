"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";

export function Avatar({
  nome,
  fotoUrl,
  size = 36,
  className,
}: {
  nome: string;
  fotoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  const mostrarFoto = Boolean(fotoUrl) && !falhou;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300",
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
