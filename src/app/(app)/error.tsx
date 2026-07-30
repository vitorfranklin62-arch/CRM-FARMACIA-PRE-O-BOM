"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400">
        <AlertTriangle size={26} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Algo deu errado</h2>
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Essa parte do painel travou por algum motivo. Tenta de novo — se continuar acontecendo, avisa a equipe
          técnica.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>
          <RotateCcw size={15} /> Tentar de novo
        </Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/dashboard")}>
          <LayoutDashboard size={15} /> Ir pro Dashboard
        </Button>
      </div>
    </div>
  );
}
