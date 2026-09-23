"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      {/* Em telas pequenas o modal vira uma folha que sobe do rodapé, com o
          próprio conteúdo rolando — assim um formulário grande nunca corta
          o botão de salvar fora da tela. */}
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-navy-800 dark:shadow-black/40 sm:max-h-[88vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10 sm:px-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>
        <div className="rolagem-fina overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
