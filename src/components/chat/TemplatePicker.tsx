"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { TemplateMensagem } from "@/types/database";

const CATEGORIA_VARIANT = {
  confirmacao: "green",
  promocao: "purple",
  duvida: "blue",
  outro: "gray",
} as const;

export function TemplatePicker({
  templates,
  onSelect,
  onClose,
}: {
  templates: TemplateMensagem[];
  onSelect: (conteudo: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="rolagem-fina mb-2 max-h-56 overflow-y-auto rounded-xl border border-brand-200/70 bg-white shadow-card-md dark:border-white/10 dark:bg-navy-800">
      <div className="flex items-center justify-between border-b border-brand-100 bg-gradient-to-r from-brand-50 to-accent-50/60 px-3 py-2 dark:border-white/10 dark:from-brand-500/15 dark:to-accent-500/10">
        <p className="text-xs font-semibold text-brand-700 dark:text-brand-200">Selecione um template</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
          <X size={14} />
        </button>
      </div>
      {templates.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">Nenhum template cadastrado.</p>
      )}
      {templates.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.conteudo)}
          className="flex w-full flex-col items-start gap-1 border-b border-brand-50 px-3 py-2.5 text-left transition last:border-0 hover:bg-brand-50/70 dark:border-white/5 dark:hover:bg-white/5"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.titulo}</span>
            {t.categoria && <Badge variant={CATEGORIA_VARIANT[t.categoria]}>{t.categoria}</Badge>}
          </div>
          <p className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{t.conteudo}</p>
        </button>
      ))}
    </div>
  );
}
