"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AffiliateEmptyState,
  AffiliateHomeCard,
  AffiliateListPanel,
} from "@/components/affiliate/primitives";
import { affiliateBadgeClass } from "@/components/affiliate/AffiliateBadge";
import { copyToClipboard } from "@/components/admin/PortalCredentialsDialog";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { AffiliateCouponRow } from "@/lib/affiliate/reach";

/**
 * Discount codes credited to this affiliate.
 *
 * A coupon attributes a sale without the customer ever clicking a link, so the
 * per-status counts matter: they are the only place an affiliate can see that
 * a code-driven order is still pending rather than missing.
 */

function CouponRow({ coupon }: { coupon: AffiliateCouponRow }) {
  const copy = AFFILIATE_COPY.coupons;
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (await copyToClipboard(coupon.code)) {
      setCopied(true);
      toast.success(copy.copied);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(copy.copyFailed);
    }
  }

  const paid = coupon.uses?.paid ?? 0;
  const unpaid = coupon.uses?.unpaid ?? 0;
  const pending = coupon.uses?.pending ?? 0;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Ticket className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <code className="truncate font-mono text-sm font-semibold text-brand-dark">
          {coupon.code}
        </code>
        {coupon.amount && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {coupon.amount}
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {coupon.totalUses === 0 ? (
          <span className="text-xs text-muted-foreground">{copy.unused}</span>
        ) : (
          <>
            {paid > 0 && (
              <span className={affiliateBadgeClass("paid")}>
                {copy.paidOrders(paid)}
              </span>
            )}
            {unpaid > 0 && (
              <span className={affiliateBadgeClass("unpaid")}>
                {copy.unpaidOrders(unpaid)}
              </span>
            )}
            {pending > 0 && (
              <span className={affiliateBadgeClass("pending")}>
                {copy.pendingOrders(pending)}
              </span>
            )}
          </>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          aria-label={`Copy ${coupon.code}`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </li>
  );
}

export function CouponsPanel({ coupons }: { coupons: AffiliateCouponRow[] }) {
  const copy = AFFILIATE_COPY.coupons;

  return (
    <AffiliateHomeCard title={copy.panelTitle} description={copy.panelDescription}>
      {coupons.length === 0 ? (
        <AffiliateEmptyState>{copy.empty}</AffiliateEmptyState>
      ) : (
        <AffiliateListPanel inset>
          <ul className="divide-y divide-border/60">
            {coupons.map((coupon) => (
              <CouponRow key={coupon.id} coupon={coupon} />
            ))}
          </ul>
        </AffiliateListPanel>
      )}
    </AffiliateHomeCard>
  );
}
