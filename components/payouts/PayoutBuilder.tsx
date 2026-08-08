"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Clock, Download, Plus, Trash2 } from "lucide-react";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { WooOrderLink } from "@/components/admin/WooOrderLink";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { PayoutDateRangeFields } from "@/components/payouts/PayoutDateRangeFields";
import { RecordHistoricalPayoutDialog } from "@/components/payouts/RecordHistoricalPayoutDialog";
import { Button } from "@/components/ui/button";
import {
  DataCard,
  DataCardHeader,
  DataCardList,
  DataCardMeta,
  ResponsiveTable,
} from "@/components/ui/data-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminMutate, useAdminQuery } from "@/hooks/use-admin-query";
import {
  defaultPayoutPeriodEnd,
  defaultPayoutPeriodStart,
  formatPeriodLabel,
  resolveDatePreset,
  toDateInputValue,
  type DatePreset,
} from "@/lib/payouts/dates";
import { formatAppDate, APP_TIMEZONE_LABEL } from "@/lib/timezone";
import type {
  OutsideRange,
  PayoutTargetOption,
  UnpaidAffiliate,
} from "@/lib/payouts/targets";
import type { PayoutPreview, TeamSummary } from "@/lib/teams/queries";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";

type PayoutBuilderProps = {
  affiliateId: string | null;
  displayName: string | null;
  /** Rendered as step 1 when provided; omitted when the affiliate is fixed. */
  onAffiliateChange?: (affiliateId: string) => void;
  selectedAffiliate?: AffiliateOption | null;
  initialTeamId?: string;
  onBatchCreated?: () => void;
  /** When false, past payouts are shown on the page-level history panel instead. */
  embedHistory?: boolean;
};

const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "all", label: "All time" },
];

const ALL_TIME_START = "2020-01-01";

export function PayoutBuilder({
  affiliateId,
  displayName,
  onAffiliateChange,
  selectedAffiliate,
  initialTeamId,
  onBatchCreated,
  embedHistory = true,
}: PayoutBuilderProps) {
  const [periodStart, setPeriodStart] = useState(() =>
    toDateInputValue(defaultPayoutPeriodStart())
  );
  const [periodEnd, setPeriodEnd] = useState(() =>
    toDateInputValue(defaultPayoutPeriodEnd())
  );
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [deleteBatch, setDeleteBatch] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const periodInvalid =
    !!periodStart && !!periodEnd && new Date(periodStart) > new Date(periodEnd);

  const periodQuery = `periodStart=${periodStart}&periodEnd=${periodEnd}`;

  const {
    data: targetsData,
    isLoading: targetsLoading,
    error: targetsError,
    refetch: refetchTargets,
  } = useAdminQuery<{
    targets: PayoutTargetOption[];
    outsideRange: OutsideRange;
  }>(
    ["admin", "payout-targets", affiliateId ?? "", periodQuery],
    affiliateId && !periodInvalid
      ? `/api/admin/payouts/targets?sponsorAffiliateId=${affiliateId}&${periodQuery}`
      : null
  );

  const targets = useMemo(() => targetsData?.targets ?? [], [targetsData]);
  const outsideRange = targetsData?.outsideRange ?? null;
  const target = targets.find((t) => t.key === targetKey) ?? null;

  // Drop a selection that no longer exists in the current period.
  useEffect(() => {
    if (!targetKey || targetsLoading) return;
    if (!targets.some((t) => t.key === targetKey)) {
      setTargetKey(null);
    }
  }, [targetKey, targets, targetsLoading]);

  // Honour a deep link from the teams page once its team shows up.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || !initialTeamId || targets.length === 0) return;
    const match = targets.find((t) => t.key === `team:${initialTeamId}`);
    if (!match) return;
    autoSelected.current = true;
    setTargetKey(match.key);
  }, [initialTeamId, targets]);

  // With a single option there is nothing to choose, so skip the extra click
  // and let the review section fill in straight away.
  useEffect(() => {
    if (targetKey || targetsLoading || targets.length !== 1) return;
    setTargetKey(targets[0].key);
  }, [targetKey, targets, targetsLoading]);

  const previewParams = target
    ? new URLSearchParams({
        periodStart,
        periodEnd,
        scope: target.scope,
        ...(affiliateId ? { sponsorAffiliateId: affiliateId } : {}),
        ...(target.teamId ? { teamId: target.teamId } : {}),
        ...(target.sourceAffiliateId
          ? { sourceAffiliateId: target.sourceAffiliateId }
          : {}),
      }).toString()
    : null;

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
    refetch: refetchPreview,
  } = useAdminQuery<PayoutPreview>(
    ["admin", "payout-preview", previewParams ?? ""],
    previewParams ? `/api/admin/payouts/preview?${previewParams}` : null
  );

  const {
    data: batchesData,
    isLoading: batchesLoading,
    refetch: refetchBatches,
  } = useAdminQuery<{ batches: Array<{ id: string; label: string; status: string; teamName: string | null; entryCount: number; totalAmount: number; processedAt: string | null; createdAt: string }> }>(
    ["admin", "payout-batches", affiliateId ?? ""],
    affiliateId && embedHistory
      ? `/api/admin/payouts/batches?sponsorAffiliateId=${affiliateId}`
      : null
  );

  const { data: teamsData, refetch: refetchTeams } = useAdminQuery<{
    teams: TeamSummary[];
  }>(
    ["admin", "teams", affiliateId ?? ""],
    affiliateId ? `/api/admin/teams?sponsorAffiliateId=${affiliateId}` : null
  );

  function applyPreset(preset: DatePreset) {
    const range = resolveDatePreset(preset);
    setPeriodStart(range.from ? toDateInputValue(range.from) : ALL_TIME_START);
    setPeriodEnd(toDateInputValue(range.to ?? defaultPayoutPeriodEnd()));
  }

  const activePreset = PRESETS.find((p) => {
    const range = resolveDatePreset(p.id);
    const from = range.from ? toDateInputValue(range.from) : ALL_TIME_START;
    const to = toDateInputValue(range.to ?? defaultPayoutPeriodEnd());
    return from === periodStart && to === periodEnd;
  })?.id;

  async function refreshAll() {
    await Promise.all([refetchTargets(), refetchBatches(), refetchTeams()]);
    onBatchCreated?.();
  }

  async function runPayout() {
    if (!target || !affiliateId) return;
    setRunning(true);
    try {
      const result = await adminMutate<{ label: string; entryCount: number }>(
        "/api/admin/payouts/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodStart,
            periodEnd,
            scope: target.scope,
            sponsorAffiliateId: affiliateId,
            teamId: target.teamId,
            sourceAffiliateId: target.sourceAffiliateId,
          }),
        }
      );

      toast.success(`Payout created: ${result.label}`, {
        description: `${result.entryCount.toLocaleString("en-US")} commissions included in this receipt.`,
      });
      setConfirmOpen(false);
      setTargetKey(null);
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setRunning(false);
    }
  }

  async function removeBatch() {
    if (!deleteBatch) return;
    setPendingBatchId(deleteBatch.id);
    try {
      const result = await adminMutate<{ entriesReleased: number }>(
        `/api/admin/payouts/batches/${deleteBatch.id}`,
        { method: "DELETE" }
      );
      toast.success("Payout deleted", {
        description: `${result.entriesReleased.toLocaleString("en-US")} sales are unpaid again.`,
      });
      setDeleteBatch(null);
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete payout");
    } finally {
      setPendingBatchId(null);
    }
  }

  const canCreate =
    !!preview &&
    !!target &&
    !previewLoading &&
    preview.totals.entryCount > 0 &&
    !running;

  return (
    <div className="space-y-5">
      {onAffiliateChange && (
        <AffiliateSearchCombobox
          id="payout-sponsor"
          label="Ambassador"
          value={affiliateId ?? ""}
          selected={selectedAffiliate}
          onChange={(id) => {
            setTargetKey(null);
            autoSelected.current = true;
            onAffiliateChange(id);
          }}
        />
      )}

      {!affiliateId ? (
        <OwedShortlist onSelect={onAffiliateChange} />
      ) : (
        <>
          <Step number={1} title="Pick the period">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESETS.map((preset) => (
                  <Chip
                    key={preset.id}
                    active={activePreset === preset.id}
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.label}
                  </Chip>
                ))}
                <span className="ml-1 hidden text-[11px] text-muted-foreground sm:inline">
                  or custom dates
                </span>
              </div>

              <PayoutDateRangeFields
                startValue={periodStart}
                endValue={periodEnd}
                onStartChange={setPeriodStart}
                onEndChange={setPeriodEnd}
                hint={`Sales made ${formatPeriodLabel(new Date(periodStart), new Date(periodEnd))} (${APP_TIMEZONE_LABEL}), matching what a partner sees in their own sales report.`}
              />
            </div>
          </Step>

          <Step number={2} title="Choose what to pay">
            {periodInvalid && (
              <p className="text-sm text-destructive">
                Fix the date range to see what can be paid.
              </p>
            )}

            {!periodInvalid && targetsError && (
              <ErrorState
                message={targetsError.message}
                onRetry={() => refetchTargets()}
              />
            )}

            {!periodInvalid && targetsLoading && (
              <p className="text-sm text-muted-foreground">
                Checking what&apos;s unpaid...
              </p>
            )}

            {!periodInvalid && !targetsLoading && targets.length === 0 && (
              <EmptyState
                title="Nothing unpaid in this period"
                description="Try a wider date range — All time shows everything still owed."
                action={
                  (teamsData?.teams.length ?? 0) === 0 && affiliateId ? (
                    <Button size="sm" asChild>
                      <Link
                        href={`/admin/teams?sponsorId=${affiliateId}&create=1`}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create team
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            )}

            {targets.length > 0 && (
              <TargetList
                targets={targets}
                selectedKey={targetKey}
                onSelect={setTargetKey}
              />
            )}

            {!targetsLoading && outsideRange && outsideRange.entryCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-warning-soft px-4 py-3">
                <p className="text-sm leading-relaxed text-amber-900">
                  <span className="font-semibold">
                    {formatCurrency(outsideRange.amount)}
                  </span>{" "}
                  in unpaid sales
                  {outsideRange.oldestSaleDate
                    ? ` going back to ${formatAppDate(outsideRange.oldestSaleDate, {
                        month: "short",
                        day: "numeric",
                      })}`
                    : ""}{" "}
                  falls outside these dates.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-300/80 bg-card hover:bg-card"
                  onClick={() => applyPreset("all")}
                >
                  Include everything
                </Button>
              </div>
            )}
          </Step>

          <Step number={3} title="Review and create" last>
            {!target ? (
              <p className="text-sm text-muted-foreground">
                Pick something to pay above and its sales will show up here.
              </p>
            ) : previewError ? (
              <ErrorState
                message={previewError.message}
                onRetry={() => refetchPreview()}
              />
            ) : previewLoading || !preview ? (
              <p className="text-sm text-muted-foreground">
                Adding up {target.label}&apos;s sales...
              </p>
            ) : preview.totals.entryCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing left to pay for this selection.
              </p>
            ) : (
              <PreviewPanel
                preview={preview}
                exportHref={`/api/admin/payouts/preview/export?${previewParams}`}
                action={
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <Button
                      size="lg"
                      className="h-11 rounded-lg px-6 font-semibold shadow-xs"
                      disabled={!canCreate}
                      onClick={() => setConfirmOpen(true)}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Record payout ·{" "}
                      {formatCurrency(preview.totals.grandTotal)}
                    </Button>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Creates a receipt listing what this payout includes.
                    </p>
                  </div>
                }
              />
            )}
          </Step>

          {!embedHistory && affiliateId && (
            <div className="flex justify-end border-t border-border/70 pt-5">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => setRecordOpen(true)}
              >
                <Clock className="mr-2 h-3.5 w-3.5" />
                Record historical payout
              </Button>
            </div>
          )}

          {embedHistory && (
          <section className="space-y-3 border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                Past payouts for {displayName ?? "this affiliate"}
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRecordOpen(true)}
              >
                <Clock className="mr-2 h-4 w-4" />
                Record historical
              </Button>
            </div>
            {batchesLoading && (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            {!batchesLoading && batchesData?.batches.length === 0 && (
              <p className="text-sm text-muted-foreground">No payouts yet.</p>
            )}
            {!batchesLoading && batchesData && batchesData.batches.length > 0 && (
              <div className="divide-y divide-border rounded-lg border border-border">
                {batchesData.batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <Link
                      href={`/admin/payouts/${batch.id}`}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <p className="truncate font-medium">{batch.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {batch.teamName ? `${batch.teamName} · ` : ""}
                        {batch.entryCount.toLocaleString("en-US")} sales ·{" "}
                        {formatAppDate(
                          batch.processedAt ?? batch.createdAt
                        )}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold">
                        {formatCurrency(batch.totalAmount)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${batch.label}`}
                        disabled={pendingBatchId === batch.id}
                        onClick={() =>
                          setDeleteBatch({ id: batch.id, label: batch.label })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Record this payout?"
        description={
          preview && target
            ? `Records ${preview.totals.entryCount.toLocaleString("en-US")} sales (${formatCurrency(preview.totals.grandTotal)}) for ${target.label}. You can delete it from the detail page if it's wrong.`
            : ""
        }
        confirmLabel="Record payout"
        loading={running}
        onConfirm={runPayout}
        onCancel={() => {
          if (!running) setConfirmOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!deleteBatch}
        title="Delete this payout?"
        description={
          deleteBatch
            ? `"${deleteBatch.label}" will be removed and its sales go back to unpaid, so they can be included in a future payout.`
            : ""
        }
        confirmLabel="Delete payout"
        loading={pendingBatchId === deleteBatch?.id}
        onConfirm={removeBatch}
        onCancel={() => {
          if (!pendingBatchId) setDeleteBatch(null);
        }}
      />

      <RecordHistoricalPayoutDialog
        open={recordOpen}
        affiliateId={affiliateId ?? ""}
        displayName={displayName ?? ""}
        teams={teamsData?.teams ?? []}
        onClose={() => setRecordOpen(false)}
        onRecorded={() => {
          void refetchTargets();
          void refetchBatches();
          void refetchTeams();
          onBatchCreated?.();
        }}
      />
    </div>
  );
}

function PreviewPanel({
  preview,
  exportHref,
  action,
}: {
  preview: PayoutPreview;
  exportHref: string;
  action?: React.ReactNode;
}) {
  const { totals } = preview;
  // Blended across the whole payout, so mixed direct + override selections
  // still answer "what share of these sales are we paying out?".
  const rate =
    totals.sourceRevenue > 0
      ? (totals.grandTotal / totals.sourceRevenue) * 100
      : null;

  if (totals.entryCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unpaid sales match this selection.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Figure label="Sales value" value={formatCurrency(totals.sourceRevenue)} />
        <Figure
          label="Rate"
          value={rate == null ? "—" : `${rate.toFixed(1).replace(/\.0$/, "")}%`}
        />
        <Figure
          label="Sales"
          value={totals.entryCount.toLocaleString("en-US")}
        />
        <Figure
          label="Total to pay"
          value={formatCurrency(totals.grandTotal)}
          large
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          {preview.entriesTruncated
            ? `Showing the ${preview.entries.length} most recent of ${totals.entryCount.toLocaleString("en-US")} sales. Totals above cover all of them.`
            : `All ${preview.entries.length} sales in this payout.`}
        </p>
        <Button size="sm" variant="outline" asChild>
          <a href={exportHref}>
            <Download className="mr-2 h-4 w-4" />
            Download all as CSV
          </a>
        </Button>
      </div>

      <ResponsiveTable
        table={
          <div className="ts-table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale date</TableHead>
                  <TableHead>Recruit</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Sale amount</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatSaleDate(entry.occurredAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.sourceAffiliateName ?? "Direct sale"}
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
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                      {entryRate(entry)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums">
                      {formatCurrency(entry.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        }
        cards={
          <DataCardList>
            {preview.entries.map((entry) => (
              <DataCard key={entry.id}>
                <DataCardHeader
                  title={entry.sourceAffiliateName ?? "Direct sale"}
                  subtitle={formatSaleDate(entry.occurredAt)}
                  value={formatCurrency(entry.amount)}
                  valueHint={
                    entry.orderRevenue == null
                      ? undefined
                      : `${entryRate(entry)} of ${formatCurrency(entry.orderRevenue)}`
                  }
                />
                {entry.wooOrderId && (
                  <DataCardMeta>
                    <WooOrderLink orderId={entry.wooOrderId} className="text-xs" />
                  </DataCardMeta>
                )}
              </DataCard>
            ))}
          </DataCardList>
        }
      />

      {action && (
        <div className="sticky bottom-0 z-10 -mx-1 border-t border-border/70 bg-card/95 px-1 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/90">
          {action}
        </div>
      )}
    </div>
  );
}

function entryRate(entry: { amount: number; orderRevenue: number | null }) {
  if (!entry.orderRevenue) return "—";
  return `${((entry.amount / entry.orderRevenue) * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/** Opens the page on "who needs paying?" rather than an empty search box. */
function OwedShortlist({
  onSelect,
}: {
  onSelect?: (affiliateId: string) => void;
}) {
  const { data, isLoading } = useAdminQuery<{ affiliates: UnpaidAffiliate[] }>(
    ["admin", "payouts-owed"],
    "/api/admin/payouts/owed"
  );

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Checking who&apos;s owed...</p>
    );
  }

  if (!data?.affiliates.length) {
    return (
      <EmptyState
        title="Nothing outstanding"
        description="Every commission has been included in a payout."
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="ts-field-label">Owed the most</p>
      {data.affiliates.map((affiliate) => (
        <button
          key={affiliate.id}
          type="button"
          onClick={() => onSelect?.(affiliate.id)}
          className="ts-owed-row"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-dark">
              {affiliate.displayName ?? affiliate.email}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {affiliate.entryCount.toLocaleString()} unpaid sales
            </p>
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums text-primary">
            {formatCurrency(affiliate.unpaidTotal)}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Recruits are nested under their team so the repeated amount on a one-recruit
 * team reads as "the same money, scoped differently" rather than a duplicate.
 */
function TargetList({
  targets,
  selectedKey,
  onSelect,
}: {
  targets: PayoutTargetOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const parents = targets.filter((option) => !option.parentKey);

  return (
    <div className="space-y-2" role="radiogroup" aria-label="What to pay">
      {parents.map((parent) => {
        const children = targets.filter(
          (option) => option.parentKey === parent.key
        );
        return (
          <div key={parent.key} className="space-y-2">
            <TargetRow
              option={parent}
              selected={selectedKey === parent.key}
              onSelect={() => onSelect(parent.key)}
            />
            {children.length > 0 && (
              <div className="ml-3 space-y-2 border-l-2 border-primary/10 pl-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  One recruit only
                </p>
                {children.map((child) => (
                  <TargetRow
                    key={child.key}
                    option={child}
                    selected={selectedKey === child.key}
                    onSelect={() => onSelect(child.key)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TargetRow({
  option,
  selected,
  onSelect,
}: {
  option: PayoutTargetOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      onClick={onSelect}
      aria-checked={selected}
      className={cn("ts-choice", selected && "ts-choice-selected")}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-brand-dark">
          {option.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{option.sublabel}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="text-sm font-bold tabular-nums text-primary">
          {formatCurrency(option.amount)}
        </span>
        {selected && <Check className="h-4 w-4 text-primary" />}
      </div>
    </button>
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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("ts-chip", active ? "ts-chip-active" : "ts-chip-inactive")}
    >
      {children}
    </button>
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
