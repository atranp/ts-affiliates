"use client";

import { AffiliatePortalPanel } from "@/components/admin/AffiliatePortalPanel";
import { AffiliateReachPanel } from "@/components/admin/AffiliateReachPanel";
import { AffiliateSliceWPPanel } from "@/components/admin/AffiliateSliceWPPanel";
import { AffiliateSyncButton } from "@/components/admin/AffiliateSyncButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminAffiliateDetail } from "@/lib/admin/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AffiliateProfileSidebar({
  affiliate,
  displayName,
  onUpdated,
  onViewAsAffiliate,
}: {
  affiliate: AdminAffiliateDetail;
  displayName: string;
  onUpdated: () => Promise<void>;
  onViewAsAffiliate?: () => Promise<void>;
}) {
  return (
    <div className="flex w-full flex-col gap-4 lg:sticky lg:top-8 lg:w-80 lg:shrink-0">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SliceWP profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium break-all">{affiliate.email}</span>
          </div>
          <div className="flex justify-between gap-4 border-t pt-3">
            <span className="text-muted-foreground">Last synced</span>
            <span className="text-right font-medium">
              {formatDate(affiliate.syncedAt)}
            </span>
          </div>
          <AffiliateSyncButton affiliateId={affiliate.id} onSynced={onUpdated} />
        </CardContent>
      </Card>

      <AffiliateSliceWPPanel
        affiliateId={affiliate.id}
        slicewpId={affiliate.slicewpId}
        status={affiliate.status}
        paymentEmail={affiliate.paymentEmail}
        commissionRate={affiliate.commissionRate}
        parentSlicewpId={affiliate.parentSlicewpId}
        onUpdated={onUpdated}
      />

      <AffiliateReachPanel reach={affiliate.reach} />

      <AffiliatePortalPanel
        affiliateId={affiliate.id}
        affiliateName={displayName}
        portal={affiliate.portal}
        onUpdated={onUpdated}
        onViewAsAffiliate={onViewAsAffiliate}
      />
    </div>
  );
}
