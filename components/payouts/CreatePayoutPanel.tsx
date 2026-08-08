"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Download, RefreshCw } from "lucide-react";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
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
  PayoutTarget,
} from "@/lib/payouts/create";
import type { PayoutOption, PayoutOptions } from "@/lib/payouts/options";
import { APP_TIMEZONE_LABEL, formatAppDateTime } from "@/lib/timezone";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";

function targetParams(target: PayoutTarget): Record<string, string> {
  return target.scope === "member"
    ? { scope: "member", teamId: target.teamId, memberId: target.memberId }
    : { scope: target.scope };
}

type CreatePayoutPanelProps = {
  /**
   * Locks the panel to one ambassador and drops the search step. Used where the
   * page already answers "who" — the affiliate detail screen.
   */
  fixedAffiliate?: { id: string; name: string };
  /** Runs after a payout is recorded, in place of navigating to the receipt. */
  onCreated?: (payout: CreatedPayout) => void;
};

export function CreatePayoutPanel({
  fixedAffiliate,
  onCreated,
}: CreatePayoutPanelProps = {}) {
  const router = useRouter();

  const [affiliate, setAffiliate] = useState<AffiliateOption | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Bumped to re-stamp the server-side cutoff, which is what makes "unpaid as
  // of now" mean now rather than whenever the page happened to load.
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  // Options stay hidden until SliceWP has been read for this ambassador, so a
  // payout is never priced against commissions SliceWP has already settled.
  const [syncedAffiliateId, setSyncedAffiliateId] = useState<string | null>(
    null
  );

  const affiliateId = fixedAffiliate?.id ?? affiliate?.id ?? null;
  // Steps renumber rather than showing a disabled step 1 nobody can act on.
  const stepOffset = fixedAffiliate ? 0 : 1;

  const runSync = useCallback(async (id: string) => {
    setSyncing(true);
    setSyncFailed(false);
    try {
      await apiFetch(`/api/admin/affiliates/${id}/sync`, { method: "POST" });
      setSyncedAt(Date.now());
    } catch {
      // A SliceWP outage should not lock payouts entirely, but the numbers can
      // no longer be trusted, so the banner below says so.
      setSyncFailed(true);
    } finally {
      setSyncedAffiliateId(id);
      setSyncing(false);
      setRefreshedAt(Date.now());
    }
  }, []);

  const syncStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!affiliateId) {
      syncStartedFor.current = null;
      setSyncedAffiliateId(null);
      setSyncedAt(null);
      setSyncFailed(false);
      return;
    }
    if (syncStartedFor.current === affiliateId) return;
    syncStartedFor.current = affiliateId;
    void runSync(affiliateId);
  }, [affiliateId, runSync]);

  const synced = !!affiliateId && syncedAffiliateId === affiliateId;

  const {
    data: optionsData,
    isLoading: optionsLoading,
    error: optionsError,
  } = useAdminQuery<PayoutOptions>(
    ["admin", "payout-options", affiliateId ?? "", refreshedAt],
    affiliateId && synced
      ? `/api/admin/payouts/create/options?affiliateId=${affiliateId}`
      : null,
    { staleTime: 0, gcTime: 0 }
  );

  // Flattened purely for selection lookup; the tree below drives rendering.
  const options = useMemo(() => {
    if (!optionsData) return [];
    return [
      ...(optionsData.direct ? [optionsData.direct] : []),
      ...optionsData.teams.flatMap((team) => team.members),
    ];
  }, [optionsData]);

  const selected = options.find((option) => option.key === selectedKey) ?? null;

  // Drop a selection that the refreshed options no longer offer, and skip the
  // extra click when there is only one thing to pay.
  useEffect(() => {
    if (optionsLoading) return;
    if (selectedKey && !options.some((o) => o.key === selectedKey)) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey && options.length === 1) {
      setSelectedKey(options[0].key);
    }
  }, [options, optionsLoading, selectedKey]);

  const draftQuery = selected
    ? new URLSearchParams({
        affiliateId: affiliateId!,
        ...targetParams(selected.target),
        cutoff: optionsData!.cutoff,
      }).toString()
    : null;

  const {
    data: draft,
    isLoading: draftLoading,
    isFetching: draftFetching,
    error: draftError,
  } = useAdminQuery<PayoutDraft>(
    ["admin", "payout-draft", draftQuery ?? ""],
    draftQuery ? `/api/admin/payouts/create?${draftQuery}` : null,
    { staleTime: 0, gcTime: 0 }
  );

  // Re-reading SliceWP is the point of the refresh: the cutoff moving forward
  // is meaningless if the paid/unpaid picture behind it is hours old.
  function refresh() {
    if (affiliateId) {
      void runSync(affiliateId);
      return;
    }
    setRefreshedAt(Date.now());
  }

  async function create() {
    if (!draft || !selected || !affiliateId) return;
    setCreating(true);
    try {
      const payout = await apiFetch<CreatedPayout>(
        "/api/admin/payouts/create",
        {
          method: "POST",
          body: JSON.stringify({
            affiliateId,
            ...targetParams(selected.target),
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
      setSelectedKey(null);

      if (onCreated) {
        onCreated(payout);
        refresh();
      } else {
        router.push(`/admin/payouts/${payout.batchId}`);
      }
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

  return (
    <div className="space-y-5">
      {fixedAffiliate && (
        <p className="text-sm text-muted-foreground">
          Paying{" "}
          <span className="font-semibold text-brand-dark">
            {fixedAffiliate.name}
          </span>{" "}
          everything they are owed up to right now.
        </p>
      )}

      {!fixedAffiliate && (
        <Step number={1} title="Pick the ambassador">
          <AffiliateSearchCombobox
            id="create-payout-affiliate"
            label="Ambassador"
            value={affiliateId ?? ""}
            selected={affiliate}
            onChange={(_id, option) => {
              setSelectedKey(null);
              setAffiliate(option);
            }}
          />
        </Step>
      )}

      <Step number={stepOffset + 1} title="Choose what to pay">
        {!affiliateId ? (
          <p className="text-sm text-muted-foreground">
            Pick an ambassador above and their unpaid totals will show up here.
          </p>
        ) : syncing || !synced ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Reading SliceWP so anything paid there is already excluded…
          </p>
        ) : optionsError ? (
          <ErrorState message={optionsError.message} onRetry={refresh} />
        ) : optionsLoading ? (
          <p className="text-sm text-muted-foreground">
            Checking what&apos;s owed…
          </p>
        ) : !optionsData || options.length === 0 ? (
          <EmptyState
            title="Nothing unpaid"
            description="Every commission for this ambassador has already been paid out."
          />
        ) : (
          <OptionTree
            data={optionsData}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        )}

        {syncFailed && synced && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-warning-soft px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-900" />
            <p className="text-sm leading-relaxed text-amber-900">
              Could not reach SliceWP just now, so these totals may still
              include commissions paid there. Retry before recording anything.
            </p>
          </div>
        )}
      </Step>

      <Step number={stepOffset + 2} title="Review and pay" last>
        {!selected ? (
          <p className="text-sm text-muted-foreground">
            Pick something to pay above and its commissions will show up here.
          </p>
        ) : draftError ? (
          <ErrorState message={draftError.message} onRetry={refresh} />
        ) : draftLoading || !draft ? (
          <p className="text-sm text-muted-foreground">
            Adding up {selected.label}…
          </p>
        ) : draft.entryCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing left to pay for this selection.
          </p>
        ) : (
          <div className="space-y-4">
            <CutoffBar
              cutoff={draft.cutoff}
              syncedAt={syncedAt}
              syncFailed={syncFailed}
              refreshing={draftFetching || syncing}
              onRefresh={refresh}
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Commissions"
                value={draft.entryCount.toLocaleString("en-US")}
              />
              <Figure
                label="Sales covered"
                value={
                  draft.revenueTotal > 0
                    ? formatCurrency(draft.revenueTotal)
                    : "—"
                }
                hint={
                  draft.oldestOccurredAt
                    ? `Since ${formatSaleDate(draft.oldestOccurredAt)}`
                    : undefined
                }
              />
              <Figure
                label="Earning rate"
                value={
                  draft.revenueTotal > 0
                    ? `${((draft.totalAmount / draft.revenueTotal) * 100).toFixed(1)}%`
                    : "—"
                }
                hint="Of sales covered"
              />
              <Figure
                label="Total to pay"
                value={formatCurrency(draft.totalAmount)}
                hint={
                  draft.revenueTotal > 0
                    ? `${formatCurrency(draft.revenueTotal)} × rate`
                    : undefined
                }
                large
              />
            </div>

            <EntriesTable draft={draft} />

            <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 border-t border-border/70 bg-card/95 px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:gap-4 supports-[backdrop-filter]:bg-card/90">
              <Button
                size="lg"
                className="h-11 rounded-lg px-6 font-semibold shadow-xs"
                disabled={draftFetching || syncing}
                onClick={() => setConfirmOpen(true)}
              >
                <Check className="mr-2 h-4 w-4" />
                Pay {formatCurrency(draft.totalAmount)}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-lg"
                asChild
              >
                <a href={`/api/admin/payouts/create/export?${draftQuery}`}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </a>
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
            ? `Marks ${draft.entryCount.toLocaleString("en-US")} commissions (${formatCurrency(draft.totalAmount)}) as paid to ${draft.affiliateName} for ${draft.targetLabel}, covering everything unpaid through ${formatAppDateTime(draft.cutoff)}.`
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

/**
 * Teams are headings rather than choices — their earnings are paid one member
 * at a time, so the team total is shown only as context for what is below it.
 */
function OptionTree({
  data,
  selectedKey,
  onSelect,
}: {
  data: PayoutOptions;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="space-y-4" role="radiogroup" aria-label="What to pay">
      {data.direct && (
        <OptionRow
          option={data.direct}
          selected={selectedKey === data.direct.key}
          onSelect={() => onSelect(data.direct!.key)}
        />
      )}

      {data.teams.map((team) => (
        <div key={team.teamId} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {team.label} · {team.sublabel}
            </p>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {formatCurrency(team.amount)}
            </span>
          </div>
          <div className="ml-3 space-y-2 border-l-2 border-primary/10 pl-4">
            {team.members.map((member) => (
              <OptionRow
                key={member.key}
                option={member}
                selected={selectedKey === member.key}
                onSelect={() => onSelect(member.key)}
              />
            ))}
          </div>
        </div>
      ))}

      {data.unattributed.entryCount > 0 && (
        <div className="rounded-xl border border-amber-200/80 bg-warning-soft px-4 py-3">
          <p className="text-sm leading-relaxed text-amber-900">
            <span className="font-semibold">
              {formatCurrency(data.unattributed.amount)}
            </span>{" "}
            across {data.unattributed.entryCount.toLocaleString("en-US")} unpaid{" "}
            {data.unattributed.entryCount === 1 ? "entry" : "entries"} is not
            listed above — bonuses, adjustments, and overrides with no team or
            member attached. Nothing on this screen can pay those yet.
          </p>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: PayoutOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn("ts-choice", selected && "ts-choice-selected")}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-brand-dark">
          {option.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {option.sublabel}
        </p>
        {option.math && (
          <p className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground/80">
            {option.math}
          </p>
        )}
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

function CutoffBar({
  cutoff,
  syncedAt,
  syncFailed,
  refreshing,
  onRefresh,
}: {
  cutoff: string;
  syncedAt: number | null;
  syncFailed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Everything unpaid up to{" "}
          <span className="font-semibold text-brand-dark">
            {formatAppDateTime(cutoff)}
          </span>{" "}
          ({APP_TIMEZONE_LABEL}). Sales after that stay open for the next
          payout.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {syncFailed
            ? "SliceWP could not be reached — totals may be out of date."
            : syncedAt
              ? `SliceWP read at ${formatAppDateTime(new Date(syncedAt))}, so anything paid there is already excluded.`
              : "Not yet checked against SliceWP."}
        </p>
      </div>
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
        {refreshing ? "Checking SliceWP…" : "Re-check and bring up to now"}
      </Button>
    </div>
  );
}

function EntriesTable({ draft }: { draft: PayoutDraft }) {
  const showSource = draft.target.scope !== "direct";

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {draft.entriesTruncated
          ? `Showing the ${draft.entries.length} most recent of ${draft.entryCount.toLocaleString("en-US")} commissions. The total above covers all of them — export the CSV for every line.`
          : `All ${draft.entries.length} commissions in this payout.`}
      </p>
      <div className="ts-table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale date</TableHead>
              {showSource && <TableHead>Member</TableHead>}
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Sale amount</TableHead>
              <TableHead className="text-right">Earned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatSaleDate(entry.occurredAt)}
                </TableCell>
                {showSource && (
                  <TableCell className="text-sm">
                    {entry.sourceAffiliateName ?? "Direct sale"}
                  </TableCell>
                )}
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
  hint,
  large,
}: {
  label: string;
  value: string;
  hint?: string;
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
      {hint && (
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
