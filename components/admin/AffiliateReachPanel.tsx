"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { copyToClipboard } from "@/components/admin/PortalCredentialsDialog";
import { formatCurrency } from "@/lib/utils";
import type { AdminAffiliateReach } from "@/lib/admin/types";

/**
 * What this affiliate promotes with, and how it is landing.
 *
 * Entirely read-only: every value here is owned by SliceWP, and links and
 * coupons are configured in WordPress. Shown so an admin fielding "my link is
 * wrong" or "is my coupon tracking?" can answer without opening wp-admin.
 */

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function relativeDay(iso: string | null): string {
  if (!iso) return "never";

  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** Total uses across every commission status the coupon has produced. */
function couponUseCount(uses: Record<string, number> | null): number {
  if (!uses) return 0;
  return Object.values(uses).reduce((sum, count) => sum + (count || 0), 0);
}

export function AffiliateReachPanel({ reach }: { reach: AdminAffiliateReach }) {
  const [copied, setCopied] = useState(false);

  const { visits, coupons } = reach;

  // Of the clicks, how many turned into a commission. Meaningless at zero
  // traffic, so it is hidden rather than shown as 0%.
  const conversionRate =
    visits.total > 0 ? (visits.converted / visits.total) * 100 : null;

  async function handleCopy() {
    if (!reach.referralUrl) return;

    if (await copyToClipboard(reach.referralUrl)) {
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy the link");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Referral activity</CardTitle>
        {reach.customSlug && (
          <Badge variant="secondary">/{reach.customSlug}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <span className="text-muted-foreground">Referral link</span>
          {reach.referralUrl ? (
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs">
                {reach.referralUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                aria-label="Copy referral link"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Not synced yet — run a sync to pull it from SliceWP.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 border-t pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Clicks</span>
            <span className="font-medium">{formatCount(visits.total)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Last 30 days</span>
            <span className="font-medium">{formatCount(visits.last30Days)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Converted</span>
            <span className="font-medium">
              {formatCount(visits.converted)}
              {conversionRate !== null && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {conversionRate.toFixed(1)}%
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Last click</span>
          <span className="font-medium">{relativeDay(visits.lastVisitAt)}</span>
        </div>

        {reach.storeCreditBalance !== null && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Store credit</span>
            <span className="font-medium">
              {formatCurrency(reach.storeCreditBalance)}
            </span>
          </div>
        )}

        {coupons.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <span className="text-muted-foreground">
              {coupons.length === 1 ? "Coupon" : `Coupons (${coupons.length})`}
            </span>
            <ul className="space-y-1.5">
              {coupons.map((coupon) => {
                const used = couponUseCount(coupon.uses);
                return (
                  <li
                    key={coupon.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Ticket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <code className="truncate font-mono text-xs font-medium">
                        {coupon.code}
                      </code>
                      {coupon.amount && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {coupon.amount}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {used === 0
                        ? "unused"
                        : `${formatCount(used)} ${used === 1 ? "order" : "orders"}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
