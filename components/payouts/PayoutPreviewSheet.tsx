"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { PayoutPreview } from "@/lib/teams/queries";
import type { PayoutScope } from "@/lib/payouts/types";
import { formatCurrency } from "@/lib/utils";

type PayoutPreviewSheetProps = {
  open: boolean;
  onClose: () => void;
  preview: PayoutPreview | null;
  loading?: boolean;
  title: string;
  description?: string;
  onConfirm: () => void;
  confirming?: boolean;
};

export function PayoutPreviewSheet({
  open,
  onClose,
  preview,
  loading = false,
  title,
  description,
  onConfirm,
  confirming = false,
}: PayoutPreviewSheetProps) {
  const [showLines, setShowLines] = useState(false);

  const canPay = !!preview && preview.totals.entryCount > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canPay || loading || confirming}
          >
            {confirming
              ? "Processing..."
              : preview
                ? `Pay ${formatCurrency(preview.totals.grandTotal)}`
                : "Pay"}
          </Button>
        </div>
      }
    >
      {loading && (
        <p className="text-sm text-muted-foreground">Loading preview...</p>
      )}

      {!loading && preview && preview.totals.entryCount === 0 && (
        <p className="text-sm text-muted-foreground">
          No unpaid entries match this payout scope.
        </p>
      )}

      {!loading && preview && preview.totals.entryCount > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <SummaryCell
              label="Direct"
              value={formatCurrency(preview.totals.directTotal)}
            />
            <SummaryCell
              label="Team bonuses"
              value={formatCurrency(preview.totals.overrideTotal)}
              accent
            />
            <SummaryCell
              label="Total due"
              value={formatCurrency(preview.totals.grandTotal)}
              large
            />
            <SummaryCell
              label="Entries"
              value={String(preview.totals.entryCount)}
            />
          </div>

          {preview.recruitBreakdown.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">By recruit</h3>
              <div className="space-y-2">
                {preview.recruitBreakdown.map((recruit) => (
                  <div
                    key={recruit.sourceAffiliateId}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {recruit.displayName ?? recruit.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {recruit.overrideCount}{" "}
                        {recruit.overrideCount === 1 ? "bonus" : "bonuses"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-primary">
                      {formatCurrency(recruit.overrideTotal)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {preview.lines.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setShowLines((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium"
              >
                <span>Affiliate breakdown</span>
                {showLines ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showLines && (
                <div className="space-y-2">
                  {preview.lines.map((line) => (
                    <div
                      key={line.affiliateId}
                      className="rounded-md border border-border px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {line.displayName ?? line.email}
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(line.total)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Direct {formatCurrency(line.directTotal)} · Bonuses{" "}
                        {formatCurrency(line.overrideTotal)} · {line.entryCount}{" "}
                        entries
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

function SummaryCell({
  label,
  value,
  accent,
  large,
}: {
  label: string;
  value: string;
  accent?: boolean;
  large?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-semibold ${large ? "text-xl" : "text-base"} ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export type PayoutTarget = {
  scope: PayoutScope;
  teamId?: string;
  teamName?: string;
  label: string;
};
