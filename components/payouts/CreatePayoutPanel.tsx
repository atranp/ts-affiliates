"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RefreshCw } from "lucide-react";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/admin/ErrorState";
import { WooOrderLink } from "@/components/admin/WooOrderLink";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminQuery } from "@/hooks/use-admin-query";
import { apiFetch } from "@/lib/api-client";
import type {
  CreatedPayout,
  PayoutDraft,
  PayoutSelectionScope,
} from "@/lib/payouts/create";
import { APP_TIMEZONE_LABEL, formatAppDateTime } from "@/lib/timezone";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";

const SCOPE_OPTIONS: Array<{
  id: PayoutSelectionScope;
  label: string;
  sublabel: string;
}> = [
  {
    id: "direct",
    label: "Direct sales only",
    sublabel: "Commission on sales they made themselves",
  },
  {
    id: "all",
    label: "Everything unpaid",
    sublabel: "Direct sales plus team overrides and adjustments",
  },
];

export function CreatePayoutPanel() {
  const router = useRouter();

  const [affiliate, setAffiliate] = useState<AffiliateOption | null>(null);
  const [scope, setScope] = useState<PayoutSelectionScope>("direct");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Bumped to re-stamp the server-side cutoff, which is what makes "unpaid as
  // of now" mean now rather than whenever the page happened to load.
  const [refreshedAt, setRefreshedAt] = useState(0);

  const affiliateId = affiliate?.id ?? null;

  const direct = useDraft(affiliateId, "direct", refreshedAt);
  const all = useDraft(affiliateId, "all", refreshedAt);

  const active = scope === "direct" ? direct : all;
  const draft = active.data ?? null;

  const loading = direct.isLoading || all.isLoading;
  const error = direct.error ?? all.error;

  function refresh() {
    setRefreshedAt(Date.now());
  }

  async function create() {
    if (!draft || !affiliateId) return;
    setCreating(true);
    try {
      const payout = await apiFetch<CreatedPayout>(
        "/api/admin/payouts/create",
        {
          method: "POST",
          body: JSON.stringify({
            affiliateId,
            scope,
            cutoff: draft.cutoff,
            expected: {
              entryCount: draft.entryCount,
              totalAmount: draft.totalAmount,
            },
          }),
        }
      );

      toast.success(`Paid ${formatCurrency(payout.totalAmount)}`, {
        description: `${payout.entryCount.toLocaleString("en-US")} commissions recorded on this receipt.`,
      });
      setConfirmOpen(false);
      router.push(`/admin/payouts/${payout.batchId}`);
    } catch (err) {
      setConfirmOpen(false);
      toast.error(err instanceof Error ? err.message : "Payout failed", {
        description: "Nothing was paid. The numbers below have been refreshed.",
      });
      refresh();
    } finally {
      setCreating(false);
    }
  }

  const canCreate = !!draft && draft.entryCount > 0 && !active.isFetching;

  return (
    <div className="space-y-5">
      <Step number={1} title="Pick the ambassador">
        <AffiliateSearchCombobox
          id="create-payout-affiliate"
          label="Ambassador"
          value={affiliateId ?? ""}
          selected={affiliate}
          onChange={(_id, option) => setAffiliate(option)}
        />
      </Step>

      <Step number={2} title="Choose what to pay">
        {!affiliateId ? (
          <p className="text-sm text-muted-foreground">
            Pick an ambassador above and their unpaid totals will show up here.
          </p>
        ) : error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="What to pay">
            {SCOPE_OPTIONS.map((option) => {
              const optionDraft =
                option.id === "direct" ? direct.data : all.data;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={scope === option.id}
                  onClick={() => setScope(option.id)}
                  className={cn(
                    "ts-choice",
                    scope === option.id && "ts-choice-selected"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-dark">
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {optionDraft
                        ? `${optionDraft.entryCount.toLocaleString("en-US")} unpaid · ${option.sublabel}`
                        : option.sublabel}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-sm font-bold tabular-nums text-primary">
                      {optionDraft
                        ? formatCurrency(optionDraft.totalAmount)
                        : loading
                          ? "…"
                          : "—"}
                    </span>
                    {scope === option.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Step>

      <Step number={3} title="Review and pay" last>
        {!affiliateId ? (
          <p className="text-sm text-muted-foreground">
            Nothing to review yet.
          </p>
        ) : loading || !draft ? (
          <p className="text-sm text-muted-foreground">
            Adding up what&apos;s owed…
          </p>
        ) : draft.entryCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            {draft.affiliateName} has nothing unpaid in this scope.
          </p>
        ) : (
          <div className="space-y-4">
            <CutoffBar
              draft={draft}
              refreshing={active.isFetching}
              onRefresh={refresh}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <Figure
                label="Commissions"
                value={draft.entryCount.toLocaleString("en-US")}
              />
              <Figure
                label="Oldest unpaid"
                value={
                  draft.oldestOccurredAt
                    ? formatSaleDate(draft.oldestOccurredAt)
                    : "—"
                }
              />
              <Figure
                label="Total to pay"
                value={formatCurrency(draft.totalAmount)}
                large
              />
            </div>

            <EntriesTable draft={draft} />

            <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 border-t border-border/70 bg-card/95 px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:gap-4 supports-[backdrop-filter]:bg-card/90">
              <Button
                size="lg"
                className="h-11 rounded-lg px-6 font-semibold shadow-xs"
                disabled={!canCreate}
                onClick={() => setConfirmOpen(true)}
              >
                <Check className="mr-2 h-4 w-4" />
                Pay {formatCurrency(draft.totalAmount)}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Marks these commissions paid and creates a receipt listing every
                one of them.
              </p>
            </div>
          </div>
        )}
      </Step>

      <ConfirmDialog
        open={confirmOpen}
        title="Record this payout?"
        description={
          draft
            ? `Marks ${draft.entryCount.toLocaleString("en-US")} commissions (${formatCurrency(draft.totalAmount)}) as paid to ${draft.affiliateName}, covering everything unpaid through ${formatAppDateTime(draft.cutoff)}.`
            : ""
        }
        confirmLabel="Record payout"
        loading={creating}
        onConfirm={create}
        onCancel={() => {
          if (!creating) setConfirmOpen(false);
        }}
      />
    </div>
  );
}

function useDraft(
  affiliateId: string | null,
  scope: PayoutSelectionScope,
  refreshedAt: number
) {
  return useAdminQuery<PayoutDraft>(
    ["admin", "payout-draft", affiliateId ?? "", scope, refreshedAt],
    affiliateId
      ? `/api/admin/payouts/create?affiliateId=${affiliateId}&scope=${scope}`
      : null,
    // The cutoff is stamped server-side per request, so a cached draft would
    // quietly pay through a stale instant.
    { staleTime: 0, gcTime: 0 }
  );
}

function CutoffBar({
  draft,
  refreshing,
  onRefresh,
}: {
  draft: PayoutDraft;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Everything unpaid up to{" "}
        <span className="font-semibold text-brand-dark">
          {formatAppDateTime(draft.cutoff)}
        </span>{" "}
        ({APP_TIMEZONE_LABEL}). Sales after that stay open for the next payout.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCw
          className={cn("mr-2 h-3.5 w-3.5", refreshing && "animate-spin")}
        />
        Bring up to now
      </Button>
    </div>
  );
}

function EntriesTable({ draft }: { draft: PayoutDraft }) {
  const rows = useMemo(() => draft.entries, [draft.entries]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {draft.entriesTruncated
          ? `Showing the ${rows.length} most recent of ${draft.entryCount.toLocaleString("en-US")} commissions. The total above covers all of them.`
          : `All ${rows.length} commissions in this payout.`}
      </p>
      <div className="ts-table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Sale amount</TableHead>
              <TableHead className="text-right">Earned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatSaleDate(entry.occurredAt)}
                </TableCell>
                <TableCell className="text-sm capitalize">
                  {entry.type.toLowerCase()}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm tabular-nums">
                  {entry.wooOrderId ? (
                    <WooOrderLink orderId={entry.wooOrderId} />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                  {entry.orderRevenue == null
                    ? "—"
                    : formatCurrency(entry.orderRevenue)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums">
                  {formatCurrency(entry.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
  last,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={cn("ts-step", !last && "ts-step-divider")}>
      <div className="flex items-center gap-2.5">
        <span className="ts-step-num">{number}</span>
        <h2 className="ts-section-title">{title}</h2>
      </div>
      <div className="pl-0 sm:pl-[calc(1.75rem+0.625rem)]">{children}</div>
    </section>
  );
}

function Figure({
  label,
  value,
  large,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className={cn("ts-figure", large && "ts-figure-highlight")}>
      <p className="ts-figure-label">{label}</p>
      <p
        className={cn(
          "mt-1 font-bold tabular-nums tracking-tight text-brand-dark",
          large ? "text-xl" : "text-base"
        )}
      >
        {value}
      </p>
    </div>
  );
}
