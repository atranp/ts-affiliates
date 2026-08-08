"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { FileText, Users, Share2, ChevronRight, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { AffiliateQuickActions } from "@/components/admin/AffiliateQuickActions";
import { AffiliateSyncButton } from "@/components/admin/AffiliateSyncButton";
import { StatCard, StatCardSkeleton } from "@/components/admin/StatCard";
import { ErrorState } from "@/components/admin/ErrorState";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminLedgerTable } from "@/components/admin/AdminLedgerTable";
import { AddAdjustmentDialog } from "@/components/admin/AddAdjustmentDialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { useQueryClient } from "@tanstack/react-query";
import {
  adminMutate,
  queryKeys,
  useAdminAffiliate,
  useAdminQuery,
} from "@/hooks/use-admin-query";
import { ledgerTabToFilters, useLedger, type LedgerTab } from "@/hooks/use-ledger";
import { TeamPanel, useTeam } from "@/components/TeamPanel";
import { TeamsPanel, useTeams } from "@/components/TeamsPanel";
import type {
  AdminAffiliateDetail,
} from "@/lib/admin/types";
import { AffiliatePortalPanel } from "@/components/admin/AffiliatePortalPanel";
import { CreatePayoutPanel } from "@/components/payouts/CreatePayoutPanel";
import {
  PayoutHistoryPanel,
  type PayoutBatchRow,
} from "@/components/payouts/PayoutHistoryPanel";
import { formatCurrency } from "@/lib/utils";

type ViewTab = "ledger" | "payouts" | "team" | "rules";

function statusBadgeVariant(
  status: string
): "paid" | "pending" | "secondary" | "destructive" {
  switch (status) {
    case "ACTIVE":
      return "paid";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminAffiliateDetailPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
      <AdminAffiliateDetailPageContent />
    </Suspense>
  );
}

function AdminAffiliateDetailPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const affiliateId = params.id;
  const queryClient = useQueryClient();

  const initialTab = searchParams.get("tab");
  const [viewTab, setViewTab] = useState<ViewTab>(
    initialTab === "payouts" || initialTab === "team" || initialTab === "rules"
      ? initialTab
      : "ledger"
  );
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [payoutSearch, setPayoutSearch] = useState("");

  const {
    data: affiliate,
    error: affiliateError,
    isLoading: affiliateLoading,
    refetch: refetchAffiliate,
  } = useAdminAffiliate(affiliateId);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const tabFilters = ledgerTabToFilters(ledgerTab);

  const {
    data: ledger,
    error: ledgerError,
    isLoading: ledgerLoading,
    refetch: refetchLedger,
    isFetching: ledgerFetching,
  } = useLedger({
    affiliateId,
    ...tabFilters,
    q: debouncedQ,
    teamId: teamFilter !== "all" ? teamFilter : undefined,
    page,
    limit: 50,
    enabled: !!affiliateId,
  });

  const {
    data: payoutBatches,
    isLoading: payoutBatchesLoading,
    refetch: refetchPayoutBatches,
  } = useAdminQuery<{ batches: PayoutBatchRow[] }>(
    ["admin", "payout-batches", affiliateId],
    affiliateId ? `/api/admin/payouts/batches?affiliateId=${affiliateId}` : null
  );

  const { data: teamData, isLoading: teamLoading } = useTeam(
    affiliateId,
    !!affiliateId
  );
  const { data: teamsData, isLoading: teamsLoading } = useTeams(
    affiliateId,
    !!affiliateId
  );

  async function refreshAffiliate() {
    await queryClient.invalidateQueries({
      queryKey: ["admin", "affiliate", affiliateId],
    });
    await refetchAffiliate();
  }

  async function handleViewAsAffiliate() {
    try {
      await adminMutate<{ redirectTo: string }>("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliateId }),
      });
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start preview");
    }
  }

  const displayName =
    affiliate?.displayName ?? affiliate?.email ?? "Affiliate";

  const ruleCount =
    (affiliate?.dealRules.asSponsor.length ?? 0) +
    (affiliate?.dealRules.asRecruit.length ?? 0);
  const teamCount =
    teamsData?.teams?.length ??
    (teamData?.team?.length ? 1 : 0);

  function focusLedger(status: LedgerTab) {
    setViewTab("ledger");
    setLedgerTab(status);
    setPage(1);
  }

  async function invalidateLedgerData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ledger"] }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.affiliate(affiliateId),
      }),
    ]);
  }

  async function handleLedgerUpdate(
    id: string,
    data: { status?: string; amount?: number; description?: string | null }
  ) {
    setLedgerSaving(true);
    try {
      await adminMutate(`/api/admin/ledger/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await invalidateLedgerData();
      toast.success("Ledger entry updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
      throw err;
    } finally {
      setLedgerSaving(false);
    }
  }

  async function handleBulkLedgerStatus(ids: string[], status: string) {
    setLedgerSaving(true);
    try {
      await adminMutate("/api/admin/ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      await invalidateLedgerData();
      toast.success(`Updated ${ids.length} ${ids.length === 1 ? "entry" : "entries"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
      throw err;
    } finally {
      setLedgerSaving(false);
    }
  }

  async function handleAddAdjustment(data: {
    amount: number;
    description: string;
    status: string;
  }) {
    setLedgerSaving(true);
    try {
      await adminMutate("/api/admin/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliateId, ...data }),
      });
      await invalidateLedgerData();
      setAdjustmentOpen(false);
      toast.success("Adjustment added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add adjustment");
      throw err;
    } finally {
      setLedgerSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/admin/affiliates" className="hover:text-foreground hover:underline transition-colors">
            Affiliates
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">
            {affiliate ? displayName : "Loading..."}
          </span>
        </nav>

        {affiliateLoading ? (
          <div className="space-y-2">
            <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-96 animate-pulse rounded-md bg-muted" />
          </div>
        ) : affiliate ? (
          <PageHeader
            title={displayName}
            description={`${affiliate.email} · SliceWP #${affiliate.slicewpId}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusBadgeVariant(affiliate.status)}>
                  {affiliate.status}
                </Badge>
                {affiliate.commissionRate && (
                  <Badge variant="secondary">
                    {affiliate.commissionRate}%
                  </Badge>
                )}
                <AffiliateQuickActions
                  affiliateId={affiliate.id}
                  hasPortalAccess={affiliate.portal.hasAccess}
                  portalDisabled={affiliate.portal.disabled}
                  onViewAsAffiliate={
                    affiliate.portal.hasAccess && !affiliate.portal.disabled
                      ? handleViewAsAffiliate
                      : undefined
                  }
                  onGoToPayouts={() => setViewTab("payouts")}
                />
              </div>
            }
          />
        ) : null}
      </div>

      {affiliateError && (
        <ErrorState message={affiliateError.message} onRetry={() => refetchAffiliate()} />
      )}

      {affiliateLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      )}

      {affiliate && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              className="text-left"
              onClick={() => focusLedger("unpaid")}
            >
              <StatCard
                label="Unpaid"
                value={formatCurrency(affiliate.ledger.unpaidTotal)}
                hint={`${affiliate.ledger.unpaidCount} entries`}
                variant="primary"
                className="hover:border-primary/50 transition-colors cursor-pointer h-full"
              />
            </button>
            <button
              type="button"
              className="text-left"
              onClick={() => focusLedger("paid")}
            >
              <StatCard
                label="Paid"
                value={formatCurrency(affiliate.ledger.paidTotal)}
                hint={`${affiliate.ledger.paidCount} entries`}
                variant="success"
                className="hover:border-success/50 transition-colors cursor-pointer h-full"
              />
            </button>
            <button
              type="button"
              className="text-left"
              onClick={() => focusLedger("pending")}
            >
              <StatCard
                label="Pending"
                value={formatCurrency(affiliate.ledger.pendingTotal)}
                hint="Milestone-gated"
                variant="warning"
                className="hover:border-warning/50 transition-colors cursor-pointer h-full"
              />
            </button>
            <button
              type="button"
              className="text-left"
              onClick={() => {
                focusLedger("overrides");
              }}
            >
              <StatCard
                label="Overrides"
                value={formatCurrency(affiliate.ledger.overrideTotal)}
                hint={`${affiliate.ledger.overrideCount} bonuses`}
                className="hover:border-border transition-colors cursor-pointer h-full"
              />
            </button>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            {/* Left Sidebar */}
            <div className="flex w-full flex-col gap-4 lg:sticky lg:top-8 lg:w-80 lg:shrink-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">SliceWP profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium break-all">{affiliate.email}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Payment email</span>
                    <span className="font-medium break-all">
                      {affiliate.paymentEmail ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-t pt-3">
                    <span className="text-muted-foreground">Last synced</span>
                    <span className="text-right font-medium">
                      {formatDate(affiliate.syncedAt)}
                    </span>
                  </div>
                  <AffiliateSyncButton
                    affiliateId={affiliate.id}
                    onSynced={refreshAffiliate}
                  />
                </CardContent>
              </Card>

              <AffiliatePortalPanel
                affiliateId={affiliate.id}
                affiliateName={displayName}
                portal={affiliate.portal}
                onUpdated={refreshAffiliate}
                onViewAsAffiliate={
                  affiliate.portal.hasAccess && !affiliate.portal.disabled
                    ? handleViewAsAffiliate
                    : undefined
                }
              />
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as typeof viewTab)} className="w-full">
                <TabsList className="mb-4 h-10 w-full justify-start overflow-x-auto overflow-y-hidden rounded-none border-b border-border bg-transparent p-0">
                  <TabsTrigger 
                    value="ledger" 
                    className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Ledger
                  </TabsTrigger>
                  <TabsTrigger 
                    value="payouts" 
                    className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <DollarSign className="mr-2 h-4 w-4" />
                    Payouts
                  </TabsTrigger>
                  <TabsTrigger 
                    value="team" 
                    className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Teams{teamCount > 0 ? ` (${teamCount})` : ""}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="rules" 
                    className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Deal rules{ruleCount > 0 ? ` (${ruleCount})` : ""}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ledger" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Ledger</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {ledgerError && (
                        <ErrorState
                          message={ledgerError.message}
                          onRetry={() => refetchLedger()}
                        />
                      )}

                      {ledgerLoading && <TableSkeleton columns={7} rows={6} />}

                      {!ledgerLoading && !ledgerError && ledger && (
                        <div className="space-y-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Input
                              placeholder="Search order ID or description..."
                              value={q}
                              onChange={(e) => setQ(e.target.value)}
                              className="sm:max-w-sm"
                            />
                            {teamsData?.teams && teamsData.teams.length > 0 && (
                              <select
                                className="select-field sm:max-w-xs"
                                value={teamFilter}
                                onChange={(e) => {
                                  setTeamFilter(e.target.value);
                                  setPage(1);
                                }}
                              >
                                <option value="all">All teams</option>
                                {teamsData.teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <Tabs
                            value={ledgerTab}
                            onValueChange={(v) => {
                              setLedgerTab(v as typeof ledgerTab);
                              setPage(1);
                            }}
                          >
                          <TabsList className="h-auto flex-wrap">
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                            <TabsTrigger value="paid">Paid</TabsTrigger>
                            <TabsTrigger value="pending">
                              Pending
                              {affiliate.ledger.pendingCount > 0
                                ? ` (${affiliate.ledger.pendingCount})`
                                : ""}
                            </TabsTrigger>
                            <TabsTrigger value="rejected">
                              Rejected
                              {affiliate.ledger.rejectedCount > 0
                                ? ` (${affiliate.ledger.rejectedCount})`
                                : ""}
                            </TabsTrigger>
                            <TabsTrigger value="overrides">Overrides</TabsTrigger>
                          </TabsList>
                          <TabsContent value={ledgerTab} className="space-y-4">
                            {ledger.entries.length === 0 ? (
                              <EmptyState title="No ledger entries" />
                            ) : (
                              <>
                                <AdminLedgerTable
                                  entries={ledger.entries}
                                  loading={ledgerFetching || ledgerSaving}
                                  onUpdateEntry={handleLedgerUpdate}
                                  onBulkStatus={handleBulkLedgerStatus}
                                  onAddAdjustment={() => setAdjustmentOpen(true)}
                                />
                                {ledger.totalPages > 1 && (
                                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                    <p className="text-sm text-muted-foreground">
                                      Page {ledger.page} of {ledger.totalPages} ·{" "}
                                      {ledger.total} entries
                                      {ledgerFetching ? " · updating..." : ""}
                                    </p>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => p - 1)}
                                      >
                                        Previous
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page >= ledger.totalPages}
                                        onClick={() => setPage((p) => p + 1)}
                                      >
                                        Next
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </TabsContent>
                        </Tabs>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="payouts" className="mt-0 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Record payout</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CreatePayoutPanel
                        fixedAffiliate={{
                          id: affiliate.id,
                          name: displayName,
                        }}
                        onCreated={() => {
                          void queryClient.invalidateQueries({
                            queryKey: queryKeys.admin.affiliate(affiliateId),
                          });
                          void refetchAffiliate();
                          void refetchPayoutBatches();
                        }}
                      />
                    </CardContent>
                  </Card>

                  <PayoutHistoryPanel
                    batches={payoutBatches?.batches ?? []}
                    loading={payoutBatchesLoading}
                    search={payoutSearch}
                    onSearchChange={setPayoutSearch}
                    onRefresh={() => {
                      void refetchPayoutBatches();
                    }}
                  />
                </TabsContent>

                <TabsContent value="team" className="mt-0 space-y-4">
                  {teamsLoading || teamLoading ? (
                    <p className="text-sm text-muted-foreground">Loading teams...</p>
                  ) : teamsData?.teams && teamsData.teams.length > 0 ? (
                    <TeamsPanel
                      teams={teamsData.teams}
                      adminView
                      sponsorAffiliateId={affiliateId}
                      onViewTeamLedger={(teamId) => {
                        setTeamFilter(teamId);
                        focusLedger("overrides");
                      }}
                    />
                  ) : teamData?.team && teamData.team.length > 0 ? (
                    <TeamPanel team={teamData.team} adminView />
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>No teams yet</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        <Button size="sm" asChild>
                          <Link href={`/admin/teams?sponsorId=${affiliateId}&create=1`}>
                            <Users className="mr-2 h-4 w-4" />
                            Create team
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/deal-rules?sponsorId=${affiliateId}`}>
                            <Share2 className="mr-2 h-4 w-4" />
                            Add deal rule
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="rules" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Deal rules</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {ruleCount === 0 ? (
                        <EmptyState
                          title="No deal rules"
                          action={
                            <Button asChild>
                              <Link href={`/admin/deal-rules?sponsorId=${affiliateId}`}>
                                Add deal rule
                              </Link>
                            </Button>
                          }
                        />
                      ) : (
                        <>
                          {affiliate.dealRules.asSponsor.length > 0 && (
                            <div>
                              <p className="mb-2 text-sm font-medium">Earns overrides from</p>
                              <RulesTable rules={affiliate.dealRules.asSponsor} role="sponsor" />
                            </div>
                          )}
                          {affiliate.dealRules.asRecruit.length > 0 && (
                            <div>
                              <p className="mb-2 text-sm font-medium">Generates overrides for</p>
                              <RulesTable rules={affiliate.dealRules.asRecruit} role="recruit" />
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </>
      )}

      <AddAdjustmentDialog
        open={adjustmentOpen}
        loading={ledgerSaving}
        onClose={() => setAdjustmentOpen(false)}
        onSubmit={handleAddAdjustment}
      />
    </div>
  );
}

function RulesTable({
  rules,
  role,
}: {
  rules: AdminAffiliateDetail["dealRules"]["asSponsor"];
  role: "sponsor" | "recruit";
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rule</TableHead>
          <TableHead>{role === "sponsor" ? "Recruit" : "Sponsor"}</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Milestone</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell>
              {rule.counterparty ? (
                <Link
                  href={`/admin/affiliates/${rule.counterparty.id}`}
                  className="text-primary hover:underline"
                >
                  {rule.counterparty.displayName ?? rule.counterparty.email}
                </Link>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{rule.ratePercent}%</TableCell>
            <TableCell>
              {rule.milestoneRevenueThreshold
                ? `$${Number(rule.milestoneRevenueThreshold).toLocaleString()}`
                : "—"}
            </TableCell>
            <TableCell>
              <Badge variant={rule.active ? "paid" : "secondary"}>
                {rule.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
