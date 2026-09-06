import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-gradiente-acento text-white shadow-brilho-acento hover:brightness-110 active:brightness-95 disabled:bg-none disabled:bg-accent-200 disabled:shadow-none",
  success:
    "bg-gradiente-sucesso text-white shadow-brilho-sucesso hover:brightness-110 active:brightness-95 disabled:bg-none disabled:bg-emerald-200 disabled:shadow-none",
  secondary:
    "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/70 hover:bg-brand-100 disabled:opacity-50 dark:bg-white/10 dark:text-brand-100 dark:ring-white/10 dark:hover:bg-white/15",
  danger:
    "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/70 hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20 dark:hover:bg-red-500/15",
  ghost: "text-gray-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition duration-150 disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
