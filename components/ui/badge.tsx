import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-0 px-2.5 py-1 text-xs font-medium leading-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary:
          "bg-[hsl(var(--badge-neutral-bg))] text-[hsl(var(--badge-neutral-fg))]",
        destructive:
          "bg-destructive/10 text-destructive",
        outline:
          "border border-border/60 bg-card text-muted-foreground",
        pending:
          "bg-[hsl(var(--badge-pending-bg))] text-[hsl(var(--badge-pending-fg))]",
        paid: "bg-[hsl(var(--badge-paid-bg))] text-[hsl(var(--badge-paid-fg))]",
        unpaid:
          "bg-[hsl(var(--badge-unpaid-bg))] text-[hsl(var(--badge-unpaid-fg))]",
        direct:
          "bg-[hsl(var(--badge-direct-bg))] text-[hsl(var(--badge-direct-fg))]",
        team: "bg-[hsl(var(--badge-team-bg))] text-[hsl(var(--badge-team-fg))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
