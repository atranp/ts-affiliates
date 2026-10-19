"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Download, UserRound, Wallet } from "lucide-react";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { AffiliateEmptyState } from "@/components/affiliate/primitives";
import { PayoutOptionTree } from "@/components/payouts/create/PayoutOptionTree";
import {
  CutoffBar,
  EntriesTable,
  ReviewHero,
} from "@/components/payouts/create/PayoutReview";
import {
  LoadingLine,
  WizardStepCard,
} from "@/components/payouts/create/WizardStepCard";
import { Button } from "@/components/ui/button";
import { useAdminQuery } from "@/hooks/use-admin-query";
import { useSliceWPPreSync } from "@/hooks/use-slicewp-pre-sync";
import { apiFetch } from "@/lib/api-client";
import type { CreatedPayout, PayoutDraft } from "@/lib/payouts/create";
import type { PayoutOptions } from "@/lib/payouts/options";
import { payoutTargetParams } from "@/lib/payouts/target-params";
import { formatAppDateTime } from "@/lib/timezone";
import { formatCurrency } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

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

  const affiliateId = fixedAffiliate?.id ?? affiliate?.id ?? null;
  const { synced, syncing, syncedAt, syncFailed, refreshedAt, refresh } =
    useSliceWPPreSync(affiliateId);

  const {
    data: optionsData,
    isLoading: optionsLoading,
    error: optionsError,
  } = useAdminQuery<PayoutOptions>(
    queryKeys.admin.payoutOptions(affiliateId ?? "", refreshedAt),
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
        ...payoutTargetParams(selected.target),
        cutoff: optionsData!.cutoff,
      }).toString()
    : null;

  const {
    data: draft,
    isLoading: draftLoading,
    isFetching: draftFetching,
    error: draftError,
  } = useAdminQuery<PayoutDraft>(
    queryKeys.admin.payoutDraft(draftQuery ?? ""),
    draftQuery ? `/api/admin/payouts/create?${draftQuery}` : null,
    { staleTime: 0, gcTime: 0 }
  );

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
            ...payoutTargetParams(selected.target),
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
              <PayoutOptionTree
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
