"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

/**
 * Payouts recorded here that SliceWP has not accepted.
 *
 * Worth a banner rather than a column because the money has already moved as
 * far as this app is concerned: the ledger says paid, the affiliate's balance
 * has dropped, and only SliceWP still thinks it is owed. Left alone, the next
 * person to look at SliceWP sees a payable that was already paid.
 */

export type WriteBackBatch = {
  id: string;
  label: string;
  status: "PENDING" | "FAILED";
  error: string | null;
  attempts: number;
  processedAt: string | null;
  totalAmount: number;
  sponsorName: string | null;
};

export type WriteBackHealthResponse = {
  failed: number;
  pending: number;
  drifted: number;
  batches: WriteBackBatch[];
};

type Props = {
  health: WriteBackHealthResponse | undefined;
  onRetried?: () => void;
};

export function WriteBackBanner({ health, onRetried }: Props) {
  const [retrying, setRetrying] = useState<string | null>(null);

  if (!health) return null;

  const outstanding = health.failed + health.pending;
  if (outstanding === 0 && health.drifted === 0) return null;

  async function retry(batchId: string) {
    setRetrying(batchId);
    try {
      const result = await apiFetch<{ status: string; slicewpPaymentId: number | null }>(
        "/api/admin/payouts/write-back",
        { method: "POST", body: JSON.stringify({ batchId }) }
      );
      toast.success(
        `Settled in SliceWP as payment #${result.slicewpPaymentId ?? "—"}.`
      );
      onRetried?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not settle in SliceWP."
      );
      onRetried?.();
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium">
              {outstanding > 0
                ? `${outstanding} payout${outstanding === 1 ? "" : "s"} not yet recorded in SliceWP`
                : "SliceWP disagrees about some settled payouts"}
            </p>
            <p className="text-sm text-muted-foreground">
              {outstanding > 0
                ? "These are paid here but still show as owed in SliceWP. Retrying is safe — it cannot pay twice."
                : null}
              {health.drifted > 0 ? (
                <>
                  {outstanding > 0 ? " " : null}
                  {health.drifted} settled commission
                  {health.drifted === 1 ? "" : "s"} did not come back paid from
                  SliceWP. Retrying will not fix that one — check the payment in
                  SliceWP directly.
                </>
              ) : null}
            </p>
          </div>

          {health.batches.length > 0 ? (
            <ul className="space-y-2">
              {health.batches.map((batch) => (
                <li
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{batch.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(batch.totalAmount)}
                      {batch.error ? ` · ${batch.error}` : null}
                      {batch.attempts > 0
                        ? ` · ${batch.attempts} attempt${batch.attempts === 1 ? "" : "s"}`
                        : null}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retrying === batch.id}
                    onClick={() => void retry(batch.id)}
                  >
                    <RefreshCw
                      className={`mr-2 h-3.5 w-3.5 ${retrying === batch.id ? "animate-spin" : ""}`}
                    />
                    {retrying === batch.id ? "Settling…" : "Retry"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
