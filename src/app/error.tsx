"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F5F6FA] px-4 text-center dark:bg-[#0A0F1E]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 shadow-lg shadow-navy-900/20">
        <LogoMark size={38} />
      </div>
      <div className="flex items-center gap-2 text-accent-600 dark:text-accent-400">
        <AlertTriangle size={20} />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Algo deu errado</h1>
      </div>
      <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
        Essa página travou por algum motivo. Tenta de novo — se continuar acontecendo, avisa a equipe técnica.
      </p>
      <button
        onClick={() => reset()}
        className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-600"
      >
        <RotateCcw size={15} /> Tentar de novo
      </button>
    </div>
  );
}
