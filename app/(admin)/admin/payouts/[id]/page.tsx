"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { PayoutBatchDetailView } from "@/components/payouts/PayoutBatchDetailView";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/admin/ErrorState";
import { Button } from "@/components/ui/button";
import { adminMutate, useAdminQuery } from "@/hooks/use-admin-query";
import { isPayoutPaid } from "@/lib/payouts/status";
import type { PayoutBatchDetail } from "@/lib/payouts/types";

export default function AdminPayoutDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, error, isLoading, refetch } = useAdminQuery<{
    batch: PayoutBatchDetail;
  }>(["admin", "payout-batch", params.id], `/api/admin/payouts/batches/${params.id}`);

  if (isLoading) {
    return <p className="text-muted-foreground">Loading payout...</p>;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  if (!data?.batch) {
    return <p className="text-muted-foreground">Payout not found.</p>;
  }

  const batch = data.batch;
  const paid = isPayoutPaid(batch.status);
  const backHref = batch.sponsorAffiliateId
    ? `/admin/affiliates/${batch.sponsorAffiliateId}?tab=payouts`
    : "/admin/payouts";

  async function setPaid(next: boolean) {
    setBusy(true);
    try {
      await adminMutate(`/api/admin/payouts/batches/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: next }),
      });
      toast.success(next ? "Marked as paid" : "Moved back to awaiting payment");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update payout");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const result = await adminMutate<{ entriesReleased: number }>(
        `/api/admin/payouts/batches/${params.id}`,
        { method: "DELETE" }
      );
      toast.success("Payout deleted", {
        description: `${result.entriesReleased} sales are unpaid again.`,
      });
      router.push(backHref);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete payout");
      setBusy(false);
    }
  }

  return (
    <>
      <PayoutBatchDetailView
        batch={batch}
        adminView
        backHref={backHref}
        backLabel={
          batch.sponsorAffiliateId
            ? "Back to affiliate payouts"
            : "Back to payouts"
        }
        actions={
          <>
            {paid ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setPaid(false)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Mark unpaid
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => setPaid(true)}>
                <Check className="mr-2 h-4 w-4" />
                Mark as paid
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this payout?"
        description={`"${batch.label}" will be removed and its ${batch.totals.entryCount} sales go back to unpaid, so they can be included in a future payout.`}
        confirmLabel="Delete payout"
        loading={busy}
        onConfirm={remove}
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
      />
    </>
  );
}
