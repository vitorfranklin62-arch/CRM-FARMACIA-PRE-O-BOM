import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * Paleta dos cartões de métrica. Cada cartão ganha uma cor própria pra dar
 * ritmo ao painel, mantendo o texto sempre branco sobre fundo escuro/saturado.
 */
export type CorStat = "marinho" | "azul" | "violeta" | "verde" | "laranja" | "coral" | "turquesa" | "indigo";

const CORES: Record<CorStat, string> = {
  marinho: "bg-gradient-to-br from-[#142868] to-[#24409E] shadow-brilho-marca",
  azul: "bg-gradient-to-br from-sky-500 to-blue-700 shadow-brilho-marca",
  violeta: "bg-gradient-to-br from-violet-500 to-fuchsia-700",
  verde: "bg-gradient-to-br from-emerald-500 to-teal-700 shadow-brilho-sucesso",
  laranja: "bg-gradient-to-br from-amber-500 to-orange-600",
  coral: "bg-gradient-to-br from-accent-400 to-accent-700 shadow-brilho-acento",
  turquesa: "bg-gradient-to-br from-cyan-500 to-sky-700",
  indigo: "bg-gradient-to-br from-indigo-500 to-navy-700",
};

export function StatCard({
  label,
  value,
  trend,
  caption,
  icon,
  cor = "marinho",
}: {
  label: string;
  value: string;
  /** Variação percentual vs. ontem. Omitir pra métricas "agora" (sem comparação diária). */
  trend?: number;
  /** Legenda alternativa quando não há trend (ex.: "agora", "hoje"). */
  caption?: string;
  icon: React.ReactNode;
  /** Cor do cartão. Padrão: marinho (identidade da farmácia). */
  cor?: CorStat;
}) {
  const isUp = (trend ?? 0) > 0;
  const isDown = (trend ?? 0) < 0;

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 border-transparent shadow-card-md transition hover:-translate-y-0.5 dark:border-white/10",
        CORES[cor]
      )}
    >
      {/* Brilho decorativo no canto, igual às faixas dos quadros Kanban. */}
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between">
        <p className="text-sm font-semibold text-white/85">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur">{icon}</div>
      </div>
      <p className="relative font-mono text-2xl font-bold tracking-tight text-white tabular-nums">{value}</p>
      {trend !== undefined ? (
        <div
          className={cn(
            "relative flex w-fit items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold",
            isUp && "text-emerald-200",
            isDown && "text-orange-200",
            !isUp && !isDown && "text-white/70"
          )}
        >
          {isUp && <ArrowUpRight size={13} />}
          {isDown && <ArrowDownRight size={13} />}
          {!isUp && !isDown && <Minus size={13} />}
          {Math.abs(trend)}% vs ontem
        </div>
      ) : (
        caption && (
          <div className="relative flex w-fit items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold text-white/75">
            {caption}
          </div>
        )
      )}
    </Card>
  );
}
