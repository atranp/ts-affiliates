"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Download,
  RefreshCw,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { WooOrderLink } from "@/components/admin/WooOrderLink";
import { AffiliateBadge } from "@/components/affiliate/AffiliateBadge";
import {
  AffiliateAmountCell,
  AffiliateEmptyState,
  AffiliateSectionLabel,
} from "@/components/affiliate/primitives";
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
  if (target.scope === "member") {
    const ref =
      target.directPayout.source === "slicewp"
        ? {
            directPayoutSource: "slicewp",
            directPayoutId: target.directPayout.paymentId,
          }
        : {
            directPayoutSource: "platform",
            directPayoutId: target.directPayout.batchId,
          };
    return {
      scope: "member",
      teamId: target.teamId,
      memberId: target.memberId,
      ...ref,
    };
  }
  return { scope: target.scope };
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
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncedAffiliateId, setSyncedAffiliateId] = useState<string | null>(
    null
  );

  const affiliateId = fixedAffiliate?.id ?? affiliate?.id ?? null;

  const runSync = useCallback(async (id: string) => {
    setSyncing(true);
    setSyncFailed(false);
    try {
      await apiFetch(`/api/admin/affiliates/${id}/sync`, { method: "POST" });
      setSyncedAt(Date.now());
    } catch {
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

  const options = useMemo(() => {
    if (!optionsData) return [];
    return [
      ...(optionsData.direct ? [optionsData.direct] : []),
      ...optionsData.teams.flatMap((team) => team.members),
    ];
  }, [optionsData]);

  const selected = options.find((option) => option.key === selectedKey) ?? null;

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
    <div className="ts-payout-shell">
      {fixedAffiliate && (
        <div className="ts-banner">
          <div className="flex items-start gap-3">
            <div className="ts-icon-box shrink-0 bg-primary/10 text-primary">
              <UserRound className="h-4 w-4" />
            </div>
            <p className="ts-row-meta leading-relaxed text-brand-dark">
              Paying{" "}
              <span className="font-semibold text-brand-dark">
                {fixedAffiliate.name}
              </span>{" "}
              everything they are owed up to right now.
            </p>
          </div>
        </div>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-12 xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-4 xl:col-span-7">
          {!fixedAffiliate && (
            <WizardStepCard step={1} title="Pick the ambassador">
              <div className="ts-payout-field-well">
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
              </div>
            </WizardStepCard>
          )}

          <WizardStepCard step={fixedAffiliate ? 1 : 2} title="Choose what to pay">
            {!affiliateId ? (
              <AffiliateEmptyState className="ts-payout-inset-panel">
                Pick an ambassador above and their unpaid totals will show up
                here.
              </AffiliateEmptyState>
            ) : syncing || !synced ? (
              <LoadingLine>
                Reading SliceWP so anything paid there is already excluded…
              </LoadingLine>
            ) : optionsError ? (
              <ErrorState message={optionsError.message} onRetry={refresh} />
            ) : optionsLoading ? (
              <LoadingLine>Checking what&apos;s owed…</LoadingLine>
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
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200/80 bg-warning-soft px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-900" />
                <p className="ts-row-meta leading-relaxed text-amber-900">
                  Could not reach SliceWP just now, so these totals may still
                  include commissions paid there. Retry before recording anything.
                </p>
              </div>
            )}
          </WizardStepCard>
        </div>

        <div className="min-w-0 xl:col-span-5 xl:border-l xl:border-border xl:pl-6">
          <div className="xl:sticky xl:top-6">
            <WizardStepCard step={fixedAffiliate ? 2 : 3} title="Review and pay">
              {!selected ? (
                <div className="ts-payout-review-empty">
                  <div className="ts-icon-box mb-2 bg-muted text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <p className="ts-row-title">Nothing selected yet</p>
                  <p className="ts-row-meta mt-1 max-w-xs">
                    Choose a payout option to see the breakdown here.
                  </p>
                </div>
              ) : draftError ? (
                <ErrorState message={draftError.message} onRetry={refresh} />
              ) : draftLoading || !draft ? (
                <LoadingLine>Adding up {selected.label}…</LoadingLine>
              ) : draft.entryCount === 0 ? (
                <AffiliateEmptyState className="ts-payout-inset-panel">
                  Nothing left to pay for this selection.
                </AffiliateEmptyState>
              ) : (
                <div className="space-y-3">
                  <ReviewHero draft={draft} selected={selected} />

                  <CutoffBar
                    cutoff={draft.cutoff}
                    syncedAt={syncedAt}
                    syncFailed={syncFailed}
                    refreshing={draftFetching || syncing}
                    onRefresh={refresh}
                  />

                  <EntriesTable draft={draft} compact />

                  <div className="ts-payout-cta-bar">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        size="lg"
                        className="h-10 flex-1 rounded-lg px-5 font-semibold shadow-xs"
                        disabled={draftFetching || syncing}
                        onClick={() => setConfirmOpen(true)}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Pay {formatCurrency(draft.totalAmount)}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-10 rounded-lg sm:shrink-0"
                        asChild
                      >
                        <a
                          href={`/api/admin/payouts/create/export?${draftQuery}`}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export CSV
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </WizardStepCard>
          </div>
        </div>
      </div>

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


function WizardStepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ts-payout-step-card overflow-visible">
      <header className="ts-payout-step-head flex items-center gap-3">
        <div className="ts-step-num">{step}</div>
        <h2 className="ts-section-title text-base">{title}</h2>
      </header>
      <div className="ts-payout-step-body overflow-visible">{children}</div>
    </section>
  );
}

function ReviewHero({
  draft,
  selected,
}: {
  draft: PayoutDraft;
  selected: PayoutOption;
}) {
  const isDirect = selected.target.scope === "direct";
  const rate =
    draft.revenueTotal > 0
      ? `${((draft.totalAmount / draft.revenueTotal) * 100).toFixed(1)}%`
      : null;

  return (
    <div className="ts-payout-hero">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="ts-row-title">{selected.label}</h3>
            <AffiliateBadge variant={isDirect ? "direct" : "team"}>
              {isDirect ? "Direct" : "Team"}
            </AffiliateBadge>
          </div>
          <p className="ts-row-meta">
            {draft.targetLabel} · {draft.affiliateName}
          </p>
          {selected.math && <p className="ts-micro">{selected.math}</p>}
        </div>
        <p className="ts-payout-hero-amount shrink-0">
          {formatCurrency(draft.totalAmount)}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <AffiliateBadge variant="neutral">
          {draft.entryCount.toLocaleString("en-US")} commissions
        </AffiliateBadge>
        {draft.revenueTotal > 0 && (
          <AffiliateBadge variant="paid">
            {formatCurrency(draft.revenueTotal)} sales
          </AffiliateBadge>
        )}
        {rate && <AffiliateBadge variant="paid">{rate} rate</AffiliateBadge>}
      </div>
    </div>
  );
}

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
    <div role="radiogroup" aria-label="What to pay" className="space-y-3">
      {data.direct && (
        <div className="ts-payout-direct-group">
          <AffiliateSectionLabel>Direct earnings</AffiliateSectionLabel>
          <OptionRow
            option={data.direct}
            selected={selectedKey === data.direct.key}
            onSelect={() => onSelect(data.direct!.key)}
          />
        </div>
      )}

      {data.teams.map((team) => (
        <div key={team.teamId} className="ts-payout-team-group">
          <AffiliateSectionLabel
            action={
              <span className="ts-row-meta font-semibold tabular-nums text-violet-900">
                {formatCurrency(team.amount)}
              </span>
            }
          >
            {team.label} · {team.sublabel}
          </AffiliateSectionLabel>
          <div className="space-y-1.5">
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
        <div className="rounded-lg border border-amber-200/80 bg-warning-soft px-3 py-2.5">
          <p className="ts-row-meta leading-relaxed text-amber-900">
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

      {data.awaitingDirectPayout.entryCount > 0 && (
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
          <p className="ts-row-meta leading-relaxed text-muted-foreground">
            <span className="font-semibold text-brand-dark">
              {formatCurrency(data.awaitingDirectPayout.amount)}
            </span>{" "}
            in team earnings is waiting on a recruit direct payout first — those
            sales are not in any paid direct receipt yet.
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
      className={cn(
        "ts-payout-option",
        selected && "ts-payout-option-selected"
      )}
    >
      <span
        className={cn(
          "ts-payout-option-radio",
          selected && "ts-payout-option-radio-selected"
        )}
        aria-hidden
      >
        {selected && (
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
        )}
      </span>

      <div className="min-w-0 flex-1 text-left">
        <p className="ts-row-title">{option.label}</p>
        <p className="ts-row-meta mt-0.5">{option.sublabel}</p>
        {option.math && (
          <p className="ts-micro mt-0.5 truncate">{option.math}</p>
        )}
      </div>

      <AffiliateAmountCell
        amount={formatCurrency(option.amount)}
        tone={selected ? "primary" : "default"}
      />
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
    <div className="ts-payout-cutoff">
      <div className="min-w-0">
        <p className="ts-row-meta text-brand-dark">
          Unpaid through{" "}
          <span className="font-semibold text-brand-dark">
            {formatAppDateTime(cutoff)}
          </span>{" "}
          ({APP_TIMEZONE_LABEL})
        </p>
        <p className="ts-row-meta mt-0.5">
          {syncFailed
            ? "SliceWP could not be reached — totals may be out of date."
            : syncedAt
              ? `SliceWP read at ${formatAppDateTime(new Date(syncedAt))}.`
              : "Not yet checked against SliceWP."}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 rounded-lg px-3 text-xs"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCw
          className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")}
        />
        {refreshing ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}

function EntriesTable({
  draft,
  compact,
}: {
  draft: PayoutDraft;
  compact?: boolean;
}) {
  const showSource = draft.target.scope !== "direct";
  const rows = compact ? draft.entries.slice(0, 5) : draft.entries;

  return (
    <div className="space-y-2">
      <p className="ts-row-meta rounded-md border border-border/60 bg-muted/25 px-2.5 py-1.5">
        {draft.entriesTruncated
          ? compact
            ? `Latest ${rows.length} of ${draft.entryCount.toLocaleString("en-US")} commissions — export CSV for all.`
            : `Showing the ${draft.entries.length} most recent of ${draft.entryCount.toLocaleString("en-US")} commissions. The total above covers all of them — export the CSV for every line.`
          : compact
            ? `All ${draft.entries.length} commissions.`
            : `All ${draft.entries.length} commissions in this payout.`}
      </p>
      <div className="ts-table-wrap">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ts-table-header h-10 px-3 text-left first:pl-4">
                Sale
              </TableHead>
              {showSource && !compact && (
                <TableHead className="ts-table-header h-10 px-3 text-left">
                  Member
                </TableHead>
              )}
              <TableHead className="ts-table-header h-10 px-3 text-right last:pr-4">
                Earned
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => (
              <TableRow
                key={entry.id}
                className="border-border/60 hover:bg-muted/40"
              >
                <TableCell className="px-3 py-2.5 first:pl-4">
                  <p className="ts-row-meta whitespace-nowrap">
                    {formatSaleDate(entry.occurredAt)}
                  </p>
                  {entry.wooOrderId ? (
                    <WooOrderLink
                      orderId={entry.wooOrderId}
                      className="text-xs"
                    />
                  ) : null}
                </TableCell>
                {showSource && !compact && (
                  <TableCell className="ts-row-title px-3 py-2.5">
                    {entry.sourceAffiliateName ?? "Direct sale"}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap px-3 py-2.5 text-right last:pr-4">
                  <AffiliateAmountCell
                    amount={formatCurrency(entry.amount)}
                    tone="primary"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LoadingLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <p className="ts-row-meta">{children}</p>
    </div>
  );
}
