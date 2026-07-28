import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  trend,
  icon,
}: {
  label: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
}) {
  const isUp = trend > 0;
  const isDown = trend < 0;

  return (
    <Card className="flex flex-col gap-3 border-transparent bg-[#142868] shadow-card-md dark:border-white/10 dark:bg-[#142868]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white/80">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">{icon}</div>
      </div>
      <p className="font-mono text-2xl font-bold tracking-tight text-white tabular-nums">{value}</p>
      <div
        className={cn(
          "flex w-fit items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold",
          isUp && "text-emerald-400",
          isDown && "text-orange-300",
          !isUp && !isDown && "text-white/70"
        )}
      >
        {isUp && <ArrowUpRight size={13} />}
        {isDown && <ArrowDownRight size={13} />}
        {!isUp && !isDown && <Minus size={13} />}
        {Math.abs(trend)}% vs ontem
      </div>
    </Card>
  );
}
