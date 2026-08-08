import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  variant?: "default" | "success" | "warning" | "primary";
  icon?: LucideIcon;
  footer?: React.ReactNode;
  className?: string;
};

const valueStyles = {
  default: "text-brand-dark",
  success: "text-emerald-700",
  warning: "text-amber-700",
  primary: "text-primary",
};

const iconStyles = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  primary: "bg-primary/10 text-primary",
};

const hoverBorder = {
  default: "hover:border-primary",
  success: "hover:border-emerald-500",
  warning: "hover:border-amber-500",
  primary: "hover:border-primary",
};

export function StatCard({
  label,
  value,
  hint,
  variant = "default",
  icon: Icon,
  footer,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "ts-stat-card group",
        hoverBorder[variant],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="ts-stat-label">{label}</span>
          <p className={cn("stat-value mt-1", valueStyles[variant])}>{value}</p>
        </div>
        {Icon && (
          <div className={cn("ts-icon-box hidden sm:block", iconStyles[variant])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {(hint || footer) && (
        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {hint && <span>{hint}</span>}
          {footer}
        </div>
      )}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="ts-stat-card space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="hidden h-10 w-10 rounded-lg sm:block" />
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}
