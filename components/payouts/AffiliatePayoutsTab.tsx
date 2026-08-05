"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  Clock,
  DollarSign,
  Plus,
  UsersRound,
} from "lucide-react";
import { PayoutDateRangeFields } from "@/components/payouts/PayoutDateRangeFields";
import {
  PayoutPreviewSheet,
  type PayoutTarget,
} from "@/components/payouts/PayoutPreviewSheet";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminMutate, useAdminQuery } from "@/hooks/use-admin-query";
import {
  defaultPayoutPeriodEnd,
  defaultPayoutPeriodStart,
  formatPeriodLabel,
  toDateInputValue,
} from "@/lib/payouts/dates";
import type { PayoutBatchListItem } from "@/lib/payouts/types";
import type { TeamSummary } from "@/lib/teams/queries";
import type { PayoutPreview } from "@/lib/teams/queries";
import { RecordHistoricalPayoutDialog } from "@/components/payouts/RecordHistoricalPayoutDialog";
import { formatCurrency } from "@/lib/utils";

type AffiliatePayoutsTabProps = {
  affiliateId: string;
  displayName: string;
  unpaidDirectTotal: number;
  /** Opens straight into this team's preview, for deep links from the teams page. */
  initialTeamId?: string;
  onBatchCreated?: () => void;
};

export function AffiliatePayoutsTab({
  affiliateId,
  displayName,
  unpaidDirectTotal,
  initialTeamId,
  onBatchCreated,
}: AffiliatePayoutsTabProps) {
  const [periodStartInput, setPeriodStartInput] = useState(() =>
    toDateInputValue(defaultPayoutPeriodStart())
  );
  const [periodEndInput, setPeriodEndInput] = useState(() =>
    toDateInputValue(defaultPayoutPeriodEnd())
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<PayoutTarget | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const periodInvalid =
    periodStartInput &&
    periodEndInput &&
    new Date(periodStartInput) > new Date(periodEndInput);

  const teamsUrl = `/api/admin/teams?sponsorAffiliateId=${affiliateId}`;
  const {
    data: teamsData,
    isLoading: teamsLoading,
    error: teamsError,
    refetch: refetchTeams,
  } = useAdminQuery<{ teams: TeamSummary[] }>(
    ["admin", "teams", affiliateId],
    teamsUrl
  );

  const {
    data: batchesData,
    isLoading: batchesLoading,
    refetch: refetchBatches,
  } = useAdminQuery<{ batches: PayoutBatchListItem[] }>(
    ["admin", "payout-batches", affiliateId],
    `/api/admin/payouts/batches?sponsorAffiliateId=${affiliateId}`
  );

  const previewUrl =
    previewTarget && previewOpen && !periodInvalid
      ? buildPreviewUrl({
          affiliateId,
          periodStart: periodStartInput,
          periodEnd: periodEndInput,
          target: previewTarget,
        })
      : null;

  const {
    data: preview,
    isLoading: previewLoading,
  } = useAdminQuery<PayoutPreview>(
    [
      "admin",
      "payout-preview",
      affiliateId,
      periodStartInput,
      periodEndInput,
      previewTarget,
    ],
    previewUrl,
    { enabled: previewOpen && !!previewTarget && !periodInvalid }
  );

  function openPreview(target: PayoutTarget) {
    setPreviewTarget(target);
    setPreviewOpen(true);
  }

  // Honour a deep link once, after the team it names has loaded.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !initialTeamId) return;
    const team = teamsData?.teams.find((t) => t.id === initialTeamId);
    if (!team) return;
    autoOpened.current = true;
    openPreview({
      scope: "team",
      teamId: team.id,
      teamName: team.name,
      label: team.name,
    });
  }, [initialTeamId, teamsData]);

  async function runPayout() {
    if (!previewTarget) return;
    setRunning(true);
    try {
      const result = await adminMutate<{
        batchId: string;
        label: string;
        entriesPaid: number;
      }>("/api/admin/payouts/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: periodStartInput,
          periodEnd: periodEndInput,
          sponsorAffiliateId: affiliateId,
          teamId: previewTarget.teamId,
          scope: previewTarget.scope,
        }),
      });

      toast.success(`Payout created: ${result.label}`, {
        description: `${result.entriesPaid} entries marked paid.`,
      });
      setPreviewOpen(false);
      setConfirmOpen(false);
      setPreviewTarget(null);
      await Promise.all([refetchBatches(), refetchTeams()]);
      onBatchCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setRunning(false);
    }
  }

  const teams = teamsData?.teams ?? [];
  const totalTeamUnpaid = teams.reduce(
    (sum, t) => sum + t.stats.unpaidTeamBonus,
    0
  );

  return (
    <div className="space-y-6">
      <PayoutDateRangeFields
        startValue={periodStartInput}
        endValue={periodEndInput}
        onStartChange={setPeriodStartInput}
        onEndChange={setPeriodEndInput}
        hint="Totals below are all-time. A payout only covers unpaid entries whose scheduled payout week falls in this range (UTC)."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Direct unpaid"
          value={formatCurrency(unpaidDirectTotal)}
        />
        <StatTile
          label="Team bonuses unpaid"
          value={formatCurrency(totalTeamUnpaid)}
          accent
        />
        <StatTile
          label="Total due"
          value={formatCurrency(unpaidDirectTotal + totalTeamUnpaid)}
          large
        />
      </div>

      {teamsError && (
        <ErrorState message={teamsError.message} onRetry={() => refetchTeams()} />
      )}

      {teamsLoading && (
        <p className="text-sm text-muted-foreground">Loading teams...</p>
      )}

      {!teamsLoading && !teamsError && teams.length === 0 && (
        <EmptyState
          title="No teams yet"
          description="Create a team to run per-team payouts and track recruit performance."
          action={
            <Button size="sm" asChild>
              <Link href={`/admin/teams?sponsorId=${affiliateId}&create=1`}>
                <Plus className="mr-2 h-4 w-4" />
                Create team
              </Link>
            </Button>
          }
        />
      )}

      {!teamsLoading && !teamsError && teams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Teams</h2>
          <div className="grid gap-3">
            {teams.map((team) => (
              <TeamPayoutCard
                key={team.id}
                team={team}
                onReview={() =>
                  openPreview({
                    scope: "team",
                    teamId: team.id,
                    teamName: team.name,
                    label: team.name,
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {unpaidDirectTotal > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Direct commissions</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <div>
              <p className="font-medium">{displayName}&apos;s direct sales</p>
              <p className="text-sm text-muted-foreground">
                Personal commissions, not team bonuses
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-lg font-semibold">
                {formatCurrency(unpaidDirectTotal)}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openPreview({
                    scope: "direct",
                    label: "Direct commissions",
                  })
                }
              >
                Review payout
              </Button>
            </div>
          </div>
        </section>
      )}

      {!teamsLoading && !teamsError && teams.length === 0 && unpaidDirectTotal > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() =>
              openPreview({
                scope: "all",
                label: "All unpaid",
              })
            }
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Review all unpaid
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Past payouts</h2>
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
                  <p className="font-medium truncate">{batch.label}</p>
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
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold">
                    {formatCurrency(batch.totalAmount)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <PayoutPreviewSheet
        open={previewOpen}
        onClose={() => {
          if (!running) {
            setPreviewOpen(false);
            setPreviewTarget(null);
          }
        }}
        preview={preview ?? null}
        loading={previewLoading}
        title={previewTarget ? `Review · ${previewTarget.label}` : "Review payout"}
        description={
          previewTarget?.teamName
            ? `${previewTarget.teamName} · ${formatPeriodLabel(
                new Date(periodStartInput),
                new Date(periodEndInput)
              )}`
            : formatPeriodLabel(
                new Date(periodStartInput),
                new Date(periodEndInput)
              )
        }
        onConfirm={() => setConfirmOpen(true)}
        confirming={running}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm payout?"
        description={
          preview
            ? `Mark ${preview.totals.entryCount} entries (${formatCurrency(preview.totals.grandTotal)}) as paid. This cannot be undone from the UI.`
            : ""
        }
        confirmLabel="Confirm payout"
        loading={running}
        onConfirm={runPayout}
        onCancel={() => {
          if (!running) setConfirmOpen(false);
        }}
      />

      <RecordHistoricalPayoutDialog
        open={recordOpen}
        affiliateId={affiliateId}
        displayName={displayName}
        teams={teams}
        onClose={() => setRecordOpen(false)}
        onRecorded={() => {
          void refetchBatches();
          void refetchTeams();
          onBatchCreated?.();
        }}
      />
    </div>
  );
}

function TeamPayoutCard({
  team,
  onReview,
}: {
  team: TeamSummary;
  onReview: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-muted-foreground" />
            <Link
              href={`/admin/affiliates/${team.sponsorAffiliateId}/teams/${team.id}`}
              className="font-medium hover:underline"
            >
              {team.name}
            </Link>
            {!team.active && (
              <Badge variant="secondary" className="text-xs">
                Inactive
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {team.memberCount} recruit{team.memberCount === 1 ? "" : "s"} ·{" "}
            {team.ruleCount} rule{team.ruleCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-primary">
            {formatCurrency(team.stats.unpaidTeamBonus)}
          </p>
          <p className="text-xs text-muted-foreground">unpaid</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
        <MiniStat label="Revenue" value={formatCurrency(team.stats.totalRevenue)} />
        <MiniStat
          label="Unpaid"
          value={formatCurrency(team.stats.unpaidTeamBonus)}
          accent
        />
        <MiniStat
          label="Pending"
          value={formatCurrency(team.stats.pendingTeamBonus)}
          warning
        />
        <MiniStat
          label="Paid"
          value={formatCurrency(team.stats.paidTeamBonus)}
          success
        />
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          variant={team.stats.unpaidTeamBonus > 0 ? "default" : "outline"}
          disabled={team.stats.unpaidTeamBonus <= 0}
          onClick={onReview}
        >
          Review payout
        </Button>
      </div>
    </div>
  );
}

function StatTile({
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
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-semibold ${large ? "text-2xl" : "text-xl"} ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
  warning,
  success,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
  success?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-medium ${
          accent
            ? "text-primary"
            : warning
              ? "text-warning"
              : success
                ? "text-success"
                : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function buildPreviewUrl({
  affiliateId,
  periodStart,
  periodEnd,
  target,
}: {
  affiliateId: string;
  periodStart: string;
  periodEnd: string;
  target: PayoutTarget;
}) {
  const params = new URLSearchParams({
    periodStart,
    periodEnd,
    sponsorAffiliateId: affiliateId,
    scope: target.scope,
  });
  if (target.teamId) params.set("teamId", target.teamId);
  return `/api/admin/payouts/preview?${params.toString()}`;
}
