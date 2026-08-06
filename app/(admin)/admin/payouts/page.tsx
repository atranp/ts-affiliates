"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { History, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import type { AffiliateOption } from "@/components/admin/AffiliateSearchCombobox";
import { ErrorState } from "@/components/admin/ErrorState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { PayoutBuilder } from "@/components/payouts/PayoutBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminMutate, useAdminQuery } from "@/hooks/use-admin-query";
import type { AdminAffiliateDetail } from "@/lib/admin/types";
import { isPayoutPaid, payoutStatusLabel } from "@/lib/payouts/status";
import { formatCurrency } from "@/lib/utils";

type PayoutBatchListItem = {
  id: string;
  label: string;
  status: string;
  processedAt: string | null;
  createdAt: string;
  teamName: string | null;
  entryCount: number;
  affiliateCount: number;
  totalAmount: number;
};

export default function AdminPayoutsPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground p-6">Loading payouts...</p>}
    >
      <AdminPayoutsPageContent />
    </Suspense>
  );
}

function AdminPayoutsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sponsorId = searchParams.get("sponsorAffiliateId") ?? "";
  const initialTeamId = searchParams.get("teamId") ?? undefined;
  const [markingId, setMarkingId] = useState<string | null>(null);

  const {
    data: sponsor,
    isLoading: sponsorLoading,
    error: sponsorError,
    refetch: refetchSponsor,
  } = useAdminQuery<AdminAffiliateDetail>(
    ["admin", "affiliate", sponsorId],
    sponsorId ? `/api/admin/affiliates/${sponsorId}` : null
  );

  const {
    data: batchesData,
    isLoading: batchesLoading,
    refetch: refetchBatches,
  } = useAdminQuery<{ batches: PayoutBatchListItem[] }>(
    ["admin", "payout-batches"],
    "/api/admin/payouts/batches"
  );

  // Keeping the sponsor in the URL makes this page refreshable and linkable,
  // which is what the teams page relies on.
  function selectSponsor(id: string) {
    const next = new URLSearchParams();
    if (id) next.set("sponsorAffiliateId", id);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  async function markPaid(batchId: string) {
    setMarkingId(batchId);
    try {
      await adminMutate(`/api/admin/payouts/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: true }),
      });
      toast.success("Marked as paid");
      await refetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update payout");
    } finally {
      setMarkingId(null);
    }
  }

  const selectedOption: AffiliateOption | null = sponsor
    ? {
        id: sponsor.id,
        email: sponsor.email,
        displayName: sponsor.displayName,
        slicewpId: sponsor.slicewpId,
        status: sponsor.status,
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Record what an affiliate is owed, then mark it paid once you've sent the money."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Create payout
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sponsorId && sponsorError ? (
            <ErrorState
              message={sponsorError.message}
              onRetry={() => refetchSponsor()}
            />
          ) : sponsorId && sponsorLoading ? (
            <TableSkeleton columns={3} rows={4} />
          ) : (
            <PayoutBuilder
              affiliateId={sponsor?.id ?? null}
              displayName={sponsor?.displayName ?? sponsor?.email ?? null}
              selectedAffiliate={selectedOption}
              onAffiliateChange={selectSponsor}
              initialTeamId={initialTeamId}
              onBatchCreated={() => {
                void refetchSponsor();
                void refetchBatches();
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* While a sponsor is selected the builder already lists their payouts
          with actions, so this cross-affiliate view would only repeat it. */}
      {!sponsorId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              All payouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {batchesLoading && <TableSkeleton columns={4} rows={6} />}
            {!batchesLoading && batchesData?.batches.length === 0 && (
              <p className="text-sm text-muted-foreground">No payouts yet.</p>
            )}
            {!batchesLoading && batchesData && batchesData.batches.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payout</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchesData.batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <Link
                          href={`/admin/payouts/${batch.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {batch.label}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {batch.entryCount.toLocaleString("en-US")} sales ·{" "}
                          {batch.affiliateCount}{" "}
                          {batch.affiliateCount === 1
                            ? "affiliate"
                            : "affiliates"}
                        </p>
                      </TableCell>
                      <TableCell>
                        {batch.teamName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(batch.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            isPayoutPaid(batch.status) ? "paid" : "pending"
                          }
                        >
                          {payoutStatusLabel(batch.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!isPayoutPaid(batch.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={markingId === batch.id}
                            onClick={() => markPaid(batch.id)}
                          >
                            Mark paid
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
