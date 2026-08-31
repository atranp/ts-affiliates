import type { LucideIcon } from "lucide-react";
import {
  formatCommissionStatus,
  formatCommissionType,
} from "@/lib/affiliate/copy";
import { isLifetimeCommission } from "@/lib/affiliate/lifetime";
import { cn } from "@/lib/utils";

export type AffiliateBadgeVariant =
  | "direct"
  | "team"
  | "lifetime"
  | "paid"
  | "unpaid"
  | "pending"
  | "neutral";

const variantClass: Record<AffiliateBadgeVariant, string> = {
  direct: "ts-affiliate-badge-direct",
  team: "ts-affiliate-badge-team",
  lifetime: "ts-affiliate-badge-lifetime",
  paid: "ts-affiliate-badge-paid",
  unpaid: "ts-affiliate-badge-unpaid",
  pending: "ts-affiliate-badge-pending",
  neutral: "ts-affiliate-badge-neutral",
};

export function affiliateBadgeClass(
  variant: AffiliateBadgeVariant,
  className?: string
) {
  return cn("ts-affiliate-badge", variantClass[variant], className);
}

export function commissionTypeVariant(
  type: string,
  isLifetimeSale?: boolean
): AffiliateBadgeVariant {
  if (isLifetimeCommission(type, isLifetimeSale)) return "lifetime";
  return type === "OVERRIDE" ? "team" : "direct";
}

export function commissionStatusVariant(status: string): AffiliateBadgeVariant {
  if (status === "PAID") return "paid";
  if (status === "UNPAID") return "unpaid";
  if (status === "PENDING") return "pending";
  return "neutral";
}

type AffiliateBadgeProps = {
  variant: AffiliateBadgeVariant;
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
};

export function AffiliateBadge({
  variant,
  children,
  className,
  icon: Icon,
}: AffiliateBadgeProps) {
  return (
    <span className={affiliateBadgeClass(variant, className)}>
      {Icon ? (
        <Icon className="h-3 w-3 shrink-0 stroke-[2]" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

export function CommissionTypeBadge({
  type,
  isLifetimeSale,
  className,
}: {
  type: string;
  isLifetimeSale?: boolean;
  className?: string;
}) {
  const lifetime = isLifetimeCommission(type, isLifetimeSale);

  return (
    <AffiliateBadge
      variant={commissionTypeVariant(type, lifetime)}
      className={className}
    >
      {formatCommissionType(type, { isLifetimeSale: lifetime })}
    </AffiliateBadge>
  );
}

export function CommissionStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <AffiliateBadge
      variant={commissionStatusVariant(status)}
      className={className}
    >
      {formatCommissionStatus(status)}
    </AffiliateBadge>
  );
}
