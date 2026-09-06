import { cn } from "@/lib/utils";

const wordmarkVariants = {
  eyebrow:
    "text-xs font-semibold uppercase tracking-widest text-brand",
  sidebar: "truncate text-base font-bold tracking-tight text-brand-dark",
  mobile: "truncate text-sm font-bold text-brand-dark",
  header:
    "truncate text-base font-bold leading-none tracking-tight text-brand-dark sm:text-lg",
} as const;

const betaVariants = {
  eyebrow:
    "rounded-full border border-brand/25 bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold lowercase tracking-normal text-brand",
  sidebar:
    "rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold lowercase tracking-normal text-primary",
  mobile:
    "rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold lowercase tracking-normal text-primary",
  header:
    "rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold lowercase tracking-normal text-primary sm:text-[10px]",
} as const;

export type BrandWordmarkVariant = keyof typeof wordmarkVariants;

export function BrandBetaBadge({
  variant = "sidebar",
  className,
}: {
  variant?: BrandWordmarkVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0",
        betaVariants[variant],
        className
      )}
    >
      beta
    </span>
  );
}

export function BrandWordmark({
  variant = "sidebar",
  className,
}: {
  variant?: BrandWordmarkVariant;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span className={wordmarkVariants[variant]}>TRUE SCIENCES</span>
      <BrandBetaBadge variant={variant} />
    </div>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand bg-brand-dark text-lg font-bold tracking-wider text-white shadow-xs">
        TS
      </div>
      <span className="absolute -right-1 -top-1 rounded-full border border-primary/20 bg-primary px-1 py-px text-[8px] font-semibold lowercase leading-none text-primary-foreground">
        beta
      </span>
    </div>
  );
}
