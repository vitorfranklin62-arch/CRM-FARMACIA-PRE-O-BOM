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
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <div
        className={cn(
          "flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          isUp && "bg-green-50 text-green-700",
          isDown && "bg-red-50 text-red-700",
          !isUp && !isDown && "bg-gray-100 text-gray-500"
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
