import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  comFaixa = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Desenha a faixa colorida no topo do cartão. */
  comFaixa?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-5 shadow-card backdrop-blur-sm transition dark:border-white/10 dark:bg-navy-800/60 dark:shadow-none",
        comFaixa && "pt-6",
        className
      )}
    >
      {comFaixa && <span aria-hidden className="faixa-arcoiris absolute inset-x-0 top-0 h-1" />}
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <span aria-hidden className="faixa-arcoiris h-4 w-1 rounded-full" />
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
