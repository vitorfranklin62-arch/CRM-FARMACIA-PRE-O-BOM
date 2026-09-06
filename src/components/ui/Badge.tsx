import { cn } from "@/lib/utils";

type BadgeVariant = "blue" | "green" | "yellow" | "gray" | "red" | "purple";

// Cada variante traz fundo suave, texto forte e um anel da mesma família de cor:
// é o que dá vida aos selos sem transformá-los em blocos chapados.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  blue: "bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/30",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  yellow: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
  gray: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-gray-300 dark:ring-white/15",
  red: "bg-accent-50 text-accent-700 ring-accent-200/70 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-400/30",
  purple: "bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30",
};

/** Bolinha da mesma cor da variante, pra leitura rápida do status. */
const DOT_CLASSES: Record<BadgeVariant, string> = {
  blue: "bg-brand-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  gray: "bg-slate-400",
  red: "bg-accent-500",
  purple: "bg-violet-500",
};

export function Badge({
  children,
  variant = "gray",
  className,
  comBolinha = false,
  pulsando = false,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  /** Mostra a bolinha colorida antes do texto. */
  comBolinha?: boolean;
  /** Faz a bolinha pulsar (usado em status que pedem ação). */
  pulsando?: boolean;
}) {
  return (
    <span className={cn("badge", VARIANT_CLASSES[variant], className)}>
      {comBolinha && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASSES[variant], pulsando && "animate-pulso-suave")}
        />
      )}
      {children}
    </span>
  );
}
