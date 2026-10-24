import { cn } from "@/lib/utils";

// Blocos cinza pulsando no formato do conteúdo — no lugar de tela em branco
// enquanto a lista ou as mensagens carregam.

const bloco = "animate-pulse rounded-md bg-brand-100/70 dark:bg-white/10";

export function SkeletonListaConversas() {
  return (
    <div aria-hidden className="space-y-0">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-brand-100/50 py-3 pl-5 pr-4 dark:border-white/5">
          <div className={cn(bloco, "h-[38px] w-[38px] shrink-0 rounded-full")} />
          <div className="flex-1 space-y-2 pt-1">
            <div className="flex justify-between gap-2">
              <div className={cn(bloco, "h-3 w-2/5")} />
              <div className={cn(bloco, "h-3 w-10")} />
            </div>
            <div className={cn(bloco, "h-3 w-3/5")} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonMensagens() {
  const larguras = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-1/4", "w-2/5"];
  return (
    <div aria-hidden className="space-y-3">
      {larguras.map((largura, i) => (
        <div key={i} className={cn("flex", i % 3 === 2 ? "justify-end" : "justify-start")}>
          <div className={cn(bloco, "h-12 rounded-2xl", largura)} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonConversa() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-brand-100/70 px-5 py-4 dark:border-white/10">
        <div className={cn(bloco, "h-[38px] w-[38px] rounded-full")} />
        <div className="space-y-2">
          <div className={cn(bloco, "h-3 w-32")} />
          <div className={cn(bloco, "h-3 w-24")} />
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-5 py-4">
        <SkeletonMensagens />
      </div>
      <div className="border-t border-brand-100/70 p-3 dark:border-white/10">
        <div className={cn(bloco, "h-10 w-full rounded-xl")} />
      </div>
    </div>
  );
}
