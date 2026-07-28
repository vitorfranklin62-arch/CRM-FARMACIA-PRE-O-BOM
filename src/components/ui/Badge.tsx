import { cn } from "@/lib/utils";

type BadgeVariant = "blue" | "green" | "yellow" | "gray" | "red" | "purple";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  blue: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  green: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  yellow: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
  gray: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  red: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300",
  purple: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
};

export function Badge({
  children,
  variant = "gray",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return <span className={cn("badge", VARIANT_CLASSES[variant], className)}>{children}</span>;
}
