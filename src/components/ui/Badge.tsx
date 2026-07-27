import { cn } from "@/lib/utils";

type BadgeVariant = "blue" | "green" | "yellow" | "gray" | "red" | "purple";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  yellow: "bg-yellow-50 text-yellow-700",
  gray: "bg-gray-100 text-gray-600",
  red: "bg-red-50 text-red-700",
  purple: "bg-purple-50 text-purple-700",
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
