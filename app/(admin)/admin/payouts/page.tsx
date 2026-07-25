"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DollarSign, History, Play } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { SetupFlowCard } from "@/components/admin/SetupFlowCard";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/admin/ErrorState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminMutate, useAdminQuery } from "@/hooks/use-admin-query";
import { apiFetch } from "@/lib/api-client";
import type { PayoutPreview } from "@/lib/teams/queries";
import { formatCurrency } from "@/lib/utils";

type AdminTeamOption = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sponsorAffiliateId: string;
  sponsorAffiliate?: {
    id: string;
    displayName: string | null;
    email: string;
  };
  ruleCount?: number;
};

type PayoutBatchListItem = {
  id: string;
  label: string;
  status: string;
  processedAt: string | null;
  createdAt: string;
  teamName: string | null;
  entryCount: number;
  affiliateCount: number;
  totalAmount: number;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-6">Loading payouts...</p>}>
      <AdminPayoutsPageContent />
    </Suspense>
  );
}

function AdminPayoutsPageContent() {
  const searchParams = useSearchParams();
  const [sponsor, setSponsor] = useState<AffiliateOption | null>(null);
  const [teamId, setTeamId] = useState("");
  const [payoutWeek, setPayoutWeek] = useState(todayInputValue());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (prefilled) return;
    const urlTeamId = searchParams.get("teamId");
    const urlSponsorId = searchParams.get("sponsorAffiliateId");

    async function prefill() {
      try {
        if (urlTeamId) {
          const { team } = await apiFetch<{
            team: {
              id: string;
              name: string;
              sponsorAffiliateId: string;
            };
          }>(`/api/admin/teams/${urlTeamId}`);
          setTeamId(team.id);
          const affiliate = await apiFetch<{
            id: string;
            email: string;
            displayName: string | null;
            slicewpId: number;
            status: string;
          }>(`/api/admin/affiliates/${team.sponsorAffiliateId}`);
          setSponsor({
            id: affiliate.id,
            email: affiliate.email,
            displayName: affiliate.displayName,
            slicewpId: affiliate.slicewpId,
            status: affiliate.status,
          });
        } else if (urlSponsorId) {
          const affiliate = await apiFetch<{
            id: string;
            email: string;
            displayName: string | null;
            slicewpId: number;
            status: string;
          }>(`/api/admin/affiliates/${urlSponsorId}`);
          setSponsor({
            id: affiliate.id,
            email: affiliate.email,
            displayName: affiliate.displayName,
            slicewpId: affiliate.slicewpId,
            status: affiliate.status,
          });
        }
      } catch {
        // ignore prefill errors
      } finally {
        setPrefilled(true);
      }
    }

    if (urlTeamId || urlSponsorId) prefill();
    else setPrefilled(true);
  }, [searchParams, prefilled]);

  const teamsUrl = sponsor?.id
    ? `/api/admin/teams?sponsorAffiliateId=${sponsor.id}`
    : null;

  const { data: teamsData, isLoading: teamsLoading } = useAdminQuery<{
    teams: AdminTeamOption[];
  }>(["admin", "teams", sponsor?.id ?? ""], teamsUrl);

  const previewUrl =
    sponsor?.id || teamId
      ? `/api/admin/payouts/preview?payoutWeek=${payoutWeek}${
          teamId ? `&teamId=${teamId}` : ""
        }${sponsor?.id ? `&sponsorAffiliateId=${sponsor.id}` : ""}`
      : null;

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
    refetch: refetchPreview,
  } = useAdminQuery<PayoutPreview>(
    ["admin", "payout-preview", teamId, sponsor?.id, payoutWeek],
    previewUrl,
    { enabled: !!(teamId || sponsor?.id) }
  );

  const {
    data: batchesData,
    isLoading: batchesLoading,
    refetch: refetchBatches,
  } = useAdminQuery<{ batches: PayoutBatchListItem[] }>(
    ["admin", "payout-batches"],
    "/api/admin/payouts/batches"
  );

  async function runPayout() {
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
          payoutWeek,
          teamId: teamId || undefined,
          sponsorAffiliateId: sponsor?.id,
        }),
      });

      toast.success(`Payout completed: ${result.label}`, {
        description: `${result.entriesPaid} ledger entries marked paid.`,
      });
      setConfirmOpen(false);
      await refetchPreview();
      await refetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setRunning(false);
    }
  }

  const selectedTeam = teamsData?.teams.find((t) => t.id === teamId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Step 3 — preview and pay unpaid commissions + team bonuses"
      />

      <SetupFlowCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Create payout
            </CardTitle>
            <CardDescription>
              1. Pick sponsor → 2. Pick team (optional) → 3. Preview → 4. Run
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>
                <strong className="text-foreground">Team selected:</strong> pays
                that team&apos;s override bonuses + sponsor&apos;s direct commissions.
              </p>
              <p>
                <strong className="text-foreground">No team:</strong> pays all
                unpaid entries for the sponsor (every team combined).
              </p>
            </div>

            <AffiliateSearchCombobox
              id="payout-sponsor"
              label="Sponsor affiliate (gets paid)"
              value={sponsor?.id ?? ""}
              selected={sponsor}
              onChange={(_id, affiliate) => {
                setSponsor(affiliate);
                setTeamId("");
              }}
            />

            <div className="space-y-2">
              <Label htmlFor="payout-team">Team (optional)</Label>
              <select
                id="payout-team"
                className="select-field w-full"
                value={teamId}
                disabled={!sponsor?.id || teamsLoading}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">
                  {sponsor?.id
                    ? "All unpaid for this affiliate"
                    : "Select sponsor first"}
                </option>
                {teamsData?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.ruleCount ?? 0} rules)
                  </option>
                ))}
              </select>
              {selectedTeam?.description && (
                <p className="text-xs text-muted-foreground">
                  {selectedTeam.description}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payout-week">Payout week (due on or before)</Label>
              <Input
                id="payout-week"
                type="date"
                value={payoutWeek}
                onChange={(e) => setPayoutWeek(e.target.value)}
              />
            </div>

            {!sponsor?.id && (
              <p className="text-sm text-muted-foreground">
                Select a sponsor affiliate to preview unpaid entries.
              </p>
            )}

            {previewError && (
              <ErrorState
                message={previewError.message}
                onRetry={() => refetchPreview()}
              />
            )}

            {previewLoading && sponsor?.id && (
              <TableSkeleton columns={4} rows={4} />
            )}

            {preview && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Direct</p>
                    <p className="font-medium">
                      {formatCurrency(preview.totals.directTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Team bonuses
                    </p>
                    <p className="font-medium text-primary">
                      {formatCurrency(preview.totals.overrideTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total due</p>
                    <p className="font-semibold text-lg">
                      {formatCurrency(preview.totals.grandTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Entries</p>
                    <p className="font-medium">{preview.totals.entryCount}</p>
                  </div>
                </div>

                {preview.lines.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Affiliate</TableHead>
                        <TableHead className="text-right">Direct</TableHead>
                        <TableHead className="text-right">Overrides</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.lines.map((line) => (
                        <TableRow key={line.affiliateId}>
                          <TableCell>
                            {line.displayName ?? line.email}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.directTotal)}
                          </TableCell>
                          <TableCell className="text-right text-primary">
                            {formatCurrency(line.overrideTotal)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(line.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No unpaid entries for this scope and payout week.
                  </p>
                )}

                <Button
                  className="w-full sm:w-auto"
                  disabled={
                    !preview.totals.entryCount || previewLoading || running
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Run payout ({formatCurrency(preview.totals.grandTotal)})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Recent payouts
            </CardTitle>
            <CardDescription>
              Completed payout batches and totals
            </CardDescription>
          </CardHeader>
          <CardContent>
            {batchesLoading && <TableSkeleton columns={4} rows={6} />}
            {!batchesLoading && batchesData?.batches.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No payouts run yet.
              </p>
            )}
            {!batchesLoading && batchesData && batchesData.batches.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchesData.batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <p className="font-medium">{batch.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.entryCount} entries · {batch.affiliateCount}{" "}
                          affiliates
                        </p>
                      </TableCell>
                      <TableCell>
                        {batch.teamName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(batch.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            batch.status === "COMPLETED" ? "paid" : "pending"
                          }
                        >
                          {batch.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Run this payout?"
        description={
          preview
            ? `Mark ${preview.totals.entryCount} unpaid entries (${formatCurrency(preview.totals.grandTotal)}) as PAID${
                selectedTeam ? ` for team "${selectedTeam.name}"` : ""
              }. This cannot be undone from the UI.`
            : ""
        }
        confirmLabel="Confirm payout"
        loading={running}
        onConfirm={runPayout}
        onCancel={() => {
          if (!running) setConfirmOpen(false);
        }}
      />
    </div>
  );
}
