"use client";

import { useAdminSettings } from "@/hooks/use-admin-query";
import { wooOrderAdminUrl } from "@/lib/woocommerce";
import { cn } from "@/lib/utils";

type WooOrderLinkProps = {
  orderId: number;
  className?: string;
  /** Stop row click handlers when the link sits inside a clickable table row. */
  stopPropagation?: boolean;
};

export function WooOrderLink({
  orderId,
  className,
  stopPropagation = false,
}: WooOrderLinkProps) {
  const { data: settings } = useAdminSettings();
  const storeUrl = settings?.wcStoreUrl?.trim();

  if (!storeUrl) {
    return (
      <span className={cn("tabular-nums", className)}>#{orderId}</span>
    );
  }

  return (
    <a
      href={wooOrderAdminUrl(storeUrl, orderId)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "tabular-nums font-medium text-primary hover:underline",
        className
      )}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
    >
      #{orderId}
    </a>
  );
}
