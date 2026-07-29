import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type AffiliateStatCardProps = {
  label: string;
  hint: string;
  value: number | string;
  tone?: "primary" | "success" | "warning";
};

const toneClasses = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
};

export function AffiliateStatCard({
  label,
  hint,
  value,
  tone = "primary",
}: AffiliateStatCardProps) {
  const display =
    typeof value === "number" ? formatCurrency(value) : value;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight", toneClasses[tone])}>
          {display}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
