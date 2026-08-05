"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { History, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { AffiliatePayoutsTab } from "@/components/payouts/AffiliatePayoutsTab";
import { Badge } from "@/components/ui/badge";
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
import { useAdminQuery } from "@/hooks/use-admin-query";
import type { AdminAffiliateDetail } from "@/lib/admin/types";
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
        description="Pick a sponsor to review and run their team or direct payouts."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Create payout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <AffiliateSearchCombobox
            id="payout-sponsor"
            label="Sponsor"
            value={sponsorId}
            selected={selectedOption}
            onChange={(id) => selectSponsor(id)}
          />

          {!sponsorId && (
            <EmptyState
              title="No sponsor selected"
              description="Search for an affiliate above to see their teams, unpaid team bonuses, and direct commissions."
            />
          )}

          {sponsorId && sponsorLoading && <TableSkeleton columns={3} rows={4} />}

          {sponsorId && sponsorError && (
            <ErrorState
              message={sponsorError.message}
              onRetry={() => refetchSponsor()}
            />
          )}

          {sponsor && (
            <AffiliatePayoutsTab
              affiliateId={sponsor.id}
              displayName={sponsor.displayName ?? sponsor.email}
              unpaidDirectTotal={sponsor.ledger.directUnpaidTotal}
              initialTeamId={initialTeamId}
              onBatchCreated={() => {
                void refetchSponsor();
                void refetchBatches();
              }}
            />
          )}
        </CardContent>
      </Card>

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
            <p className="text-sm text-muted-foreground">No payouts run yet.</p>
          )}
          {!batchesLoading && batchesData && batchesData.batches.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
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
                        {batch.entryCount} entries · {batch.affiliateCount}{" "}
                        affiliates
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
                          batch.status === "COMPLETED" ? "paid" : "pending"
                        }
                      >
                        {batch.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
