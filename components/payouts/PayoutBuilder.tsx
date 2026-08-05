"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Calculator, Check, Clock, Download, Plus } from "lucide-react";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { PayoutDateRangeFields } from "@/components/payouts/PayoutDateRangeFields";
import { RecordHistoricalPayoutDialog } from "@/components/payouts/RecordHistoricalPayoutDialog";
import { Button } from "@/components/ui/button";
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
import type { PayoutDateBasis } from "@/lib/payouts/types";
import type { PayoutTargetOption } from "@/lib/payouts/targets";
import type { PayoutPreview, TeamSummary } from "@/lib/teams/queries";
import { formatCurrency } from "@/lib/utils";

type PayoutBuilderProps = {
  affiliateId: string | null;
  displayName: string | null;
  /** Rendered as step 1 when provided; omitted when the affiliate is fixed. */
  onAffiliateChange?: (affiliateId: string) => void;
  selectedAffiliate?: AffiliateOption | null;
  initialTeamId?: string;
  onBatchCreated?: () => void;
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
}: PayoutBuilderProps) {
  const [dateBasis, setDateBasis] = useState<PayoutDateBasis>("payout_week");
  const [periodStart, setPeriodStart] = useState(() =>
    toDateInputValue(defaultPayoutPeriodStart())
  );
  const [periodEnd, setPeriodEnd] = useState(() =>
    toDateInputValue(defaultPayoutPeriodEnd())
  );
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [calculated, setCalculated] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const periodInvalid =
    !!periodStart && !!periodEnd && new Date(periodStart) > new Date(periodEnd);

  const periodQuery = `periodStart=${periodStart}&periodEnd=${periodEnd}&dateBasis=${dateBasis}`;

  const {
    data: targetsData,
    isLoading: targetsLoading,
    error: targetsError,
    refetch: refetchTargets,
  } = useAdminQuery<{ targets: PayoutTargetOption[] }>(
    ["admin", "payout-targets", affiliateId ?? "", periodQuery],
    affiliateId && !periodInvalid
      ? `/api/admin/payouts/targets?sponsorAffiliateId=${affiliateId}&${periodQuery}`
      : null
  );

  const targets = useMemo(() => targetsData?.targets ?? [], [targetsData]);
  const target = targets.find((t) => t.key === targetKey) ?? null;

  // Changing the affiliate or the period invalidates any selection and result.
  const scopeSignature = `${affiliateId ?? ""}|${periodQuery}`;
  const lastSignature = useRef(scopeSignature);
  useEffect(() => {
    if (lastSignature.current === scopeSignature) return;
    lastSignature.current = scopeSignature;
    setCalculated(false);
  }, [scopeSignature]);

  // Drop a selection that no longer exists in the current period.
  useEffect(() => {
    if (!targetKey || targetsLoading) return;
    if (!targets.some((t) => t.key === targetKey)) {
      setTargetKey(null);
      setCalculated(false);
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

  const previewParams = target
    ? new URLSearchParams({
        periodStart,
        periodEnd,
        dateBasis,
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
    calculated && previewParams
      ? `/api/admin/payouts/preview?${previewParams}`
      : null
  );

  const {
    data: batchesData,
    isLoading: batchesLoading,
    refetch: refetchBatches,
  } = useAdminQuery<{ batches: Array<{ id: string; label: string; teamName: string | null; entryCount: number; totalAmount: number; processedAt: string | null; createdAt: string }> }>(
    ["admin", "payout-batches", affiliateId ?? ""],
    affiliateId
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
    setPeriodEnd(
      toDateInputValue(range.to ?? defaultPayoutPeriodEnd())
    );
    setCalculated(false);
  }

  const activePreset = PRESETS.find((p) => {
    const range = resolveDatePreset(p.id);
    const from = range.from ? toDateInputValue(range.from) : ALL_TIME_START;
    const to = toDateInputValue(range.to ?? defaultPayoutPeriodEnd());
    return from === periodStart && to === periodEnd;
  })?.id;

  async function runPayout() {
    if (!target || !affiliateId) return;
    setRunning(true);
    try {
      const result = await adminMutate<{ label: string; entriesPaid: number }>(
        "/api/admin/payouts/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodStart,
            periodEnd,
            dateBasis,
            scope: target.scope,
            sponsorAffiliateId: affiliateId,
            teamId: target.teamId,
            sourceAffiliateId: target.sourceAffiliateId,
          }),
        }
      );

      toast.success(`Payout created: ${result.label}`, {
        description: `${result.entriesPaid} entries marked paid.`,
      });
      setConfirmOpen(false);
      setCalculated(false);
      setTargetKey(null);
      await Promise.all([
        refetchTargets(),
        refetchBatches(),
        refetchTeams(),
      ]);
      onBatchCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setRunning(false);
    }
  }

  const stepOffset = onAffiliateChange ? 1 : 0;

  return (
    <div className="space-y-6">
      {onAffiliateChange && (
        <Step number={1} title="Choose an affiliate">
          <AffiliateSearchCombobox
            id="payout-sponsor"
            label="Affiliate"
            value={affiliateId ?? ""}
            selected={selectedAffiliate}
            onChange={(id) => {
              setTargetKey(null);
              setCalculated(false);
              autoSelected.current = true;
              onAffiliateChange(id);
            }}
          />
        </Step>
      )}

      {!affiliateId ? (
        <EmptyState
          title="No affiliate selected"
          description="Search above to see what this affiliate is owed and create a payout."
        />
      ) : (
        <>
          <Step number={stepOffset + 1} title="Pick the period">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {PRESETS.map((preset) => (
                  <Chip
                    key={preset.id}
                    active={activePreset === preset.id}
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.label}
                  </Chip>
                ))}
              </div>

              <PayoutDateRangeFields
                startValue={periodStart}
                endValue={periodEnd}
                onStartChange={(v) => {
                  setPeriodStart(v);
                  setCalculated(false);
                }}
                onEndChange={(v) => {
                  setPeriodEnd(v);
                  setCalculated(false);
                }}
                hint={
                  dateBasis === "sale_date"
                    ? `Covers sales made ${formatPeriodLabel(new Date(periodStart), new Date(periodEnd))} (UTC). Use this to match a partner's own sales report.`
                    : `Covers entries scheduled for payout ${formatPeriodLabel(new Date(periodStart), new Date(periodEnd))} (UTC). This is the normal weekly run.`
                }
              />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Match dates on
                </span>
                <div className="inline-flex rounded-md border border-border bg-card p-0.5">
                  <Chip
                    active={dateBasis === "payout_week"}
                    onClick={() => {
                      setDateBasis("payout_week");
                      setCalculated(false);
                    }}
                    bare
                  >
                    Payout week
                  </Chip>
                  <Chip
                    active={dateBasis === "sale_date"}
                    onClick={() => {
                      setDateBasis("sale_date");
                      setCalculated(false);
                    }}
                    bare
                  >
                    Sale date
                  </Chip>
                </div>
              </div>
            </div>
          </Step>

          <Step number={stepOffset + 2} title="Choose what to pay">
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
                description="Try a wider period, or switch between payout week and sale date."
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
              <div className="space-y-2">
                {targets.map((option) => (
                  <TargetRow
                    key={option.key}
                    option={option}
                    selected={targetKey === option.key}
                    onSelect={() => {
                      setTargetKey(option.key);
                      setCalculated(false);
                    }}
                  />
                ))}
              </div>
            )}
          </Step>

          <Step number={stepOffset + 3} title="Review the sales">
            {!target ? (
              <p className="text-sm text-muted-foreground">
                Choose what to pay above, then calculate.
              </p>
            ) : !calculated ? (
              <Button onClick={() => setCalculated(true)}>
                <Calculator className="mr-2 h-4 w-4" />
                Calculate payout for {target.label}
              </Button>
            ) : previewError ? (
              <ErrorState
                message={previewError.message}
                onRetry={() => refetchPreview()}
              />
            ) : previewLoading || !preview ? (
              <p className="text-sm text-muted-foreground">
                Calculating...
              </p>
            ) : (
              <PreviewPanel
                preview={preview}
                exportHref={`/api/admin/payouts/preview/export?${previewParams}`}
              />
            )}
          </Step>

          <Step number={stepOffset + 4} title="Create the payout" last>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={
                  !preview ||
                  !calculated ||
                  previewLoading ||
                  preview.totals.entryCount === 0 ||
                  running
                }
                onClick={() => setConfirmOpen(true)}
              >
                <Check className="mr-2 h-4 w-4" />
                {preview && calculated && preview.totals.entryCount > 0
                  ? `Pay ${formatCurrency(preview.totals.grandTotal)}`
                  : "Pay"}
              </Button>
              {preview && calculated && preview.totals.entryCount === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing to pay for this selection.
                </p>
              )}
            </div>
          </Step>

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
                  <Link
                    key={batch.id}
                    href={`/admin/payouts/${batch.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{batch.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {batch.teamName ?? "All"} · {batch.entryCount} entries ·{" "}
                        {new Date(
                          batch.processedAt ?? batch.createdAt
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">
                      {formatCurrency(batch.totalAmount)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Create this payout?"
        description={
          preview && target
            ? `Mark ${preview.totals.entryCount} entries (${formatCurrency(preview.totals.grandTotal)}) for ${target.label} as paid. This cannot be undone from the UI.`
            : ""
        }
        confirmLabel="Create payout"
        loading={running}
        onConfirm={runPayout}
        onCancel={() => {
          if (!running) setConfirmOpen(false);
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
}: {
  preview: PayoutPreview;
  exportHref: string;
}) {
  const { totals } = preview;
  const rate =
    totals.sourceRevenue > 0
      ? (totals.overrideTotal / totals.sourceRevenue) * 100
      : null;

  if (totals.entryCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unpaid entries match this selection.
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
        <Figure label="Entries" value={String(totals.entryCount)} />
        <Figure
          label="Total to pay"
          value={formatCurrency(totals.grandTotal)}
          large
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {preview.entriesTruncated
            ? `Showing the ${preview.entries.length} most recent of ${totals.entryCount} sales. Totals above cover all of them.`
            : `All ${preview.entries.length} sales in this payout.`}
        </p>
        <Button size="sm" variant="outline" asChild>
          <a href={exportHref}>
            <Download className="mr-2 h-4 w-4" />
            Download all as CSV
          </a>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
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
                  {new Date(entry.occurredAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </TableCell>
                <TableCell className="text-sm">
                  {entry.sourceAffiliateName ?? "Direct sale"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm">
                  {entry.orderRevenue == null
                    ? "—"
                    : formatCurrency(entry.orderRevenue)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                  {entry.orderRevenue
                    ? `${((entry.amount / entry.orderRevenue) * 100).toFixed(1).replace(/\.0$/, "")}%`
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm font-medium">
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
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        option.parentKey ? "ml-6 w-[calc(100%-1.5rem)]" : ""
      } ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/50"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{option.label}</p>
        <p className="text-xs text-muted-foreground">{option.sublabel}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-semibold text-primary">
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
    <section className={last ? "" : "border-b border-border pb-6"}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {number}
        </span>
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
  bare,
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
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        bare ? "" : "border border-border"
      } ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
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
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold ${large ? "text-xl" : "text-base"}`}>
        {value}
      </p>
    </div>
  );
}
