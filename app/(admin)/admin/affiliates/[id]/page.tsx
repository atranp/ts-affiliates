"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, Users, Share2, ChevronRight, DollarSign } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/PageHeader";
import { AffiliateQuickActions } from "@/components/admin/AffiliateQuickActions";
import { StatCardSkeleton } from "@/components/admin/StatCard";
import { ErrorState } from "@/components/admin/ErrorState";
import { AffiliateLedgerStats } from "@/components/admin/affiliate-detail/AffiliateLedgerStats";
import { AffiliateLedgerTab } from "@/components/admin/affiliate-detail/AffiliateLedgerTab";
import { AffiliateProfileSidebar } from "@/components/admin/affiliate-detail/AffiliateProfileSidebar";
import { AffiliateRulesTab } from "@/components/admin/affiliate-detail/AffiliateRulesTab";
import { AffiliateTeamsTab } from "@/components/admin/affiliate-detail/AffiliateTeamsTab";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  queryKeys,
  useAdminAffiliate,
  useAdminQuery,
} from "@/hooks/use-admin-query";
import type { LedgerTab } from "@/hooks/use-ledger";
import { useTeamRoster, useTeams } from "@/hooks/use-teams";
import { apiFetch } from "@/lib/api/client";
import { affiliateStatusBadgeVariant } from "@/lib/admin/format";
import { CreatePayoutPanel } from "@/components/payouts/CreatePayoutPanel";
import {
  PayoutHistoryPanel,
  type PayoutBatchRow,
} from "@/components/payouts/PayoutHistoryPanel";

type ViewTab = "ledger" | "payouts" | "team" | "rules";

/** All four labels only fit a phone without the icons and with tighter padding. */
const detailTabClass =
  "relative h-10 shrink-0 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-4";

const detailTabIconClass = "mr-2 hidden h-4 w-4 sm:inline-block";

function resolveViewTab(value: string | null): ViewTab {
  return value === "payouts" || value === "team" || value === "rules"
    ? value
    : "ledger";
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

  const [viewTab, setViewTab] = useState<ViewTab>(() =>
    resolveViewTab(searchParams.get("tab"))
  );
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [payoutSearch, setPayoutSearch] = useState("");

  const {
    data: affiliate,
    error: affiliateError,
    isLoading: affiliateLoading,
    refetch: refetchAffiliate,
  } = useAdminAffiliate(affiliateId);

  const {
    data: payoutBatches,
    isLoading: payoutBatchesLoading,
    refetch: refetchPayoutBatches,
  } = useAdminQuery<{ batches: PayoutBatchRow[] }>(
    queryKeys.admin.payoutBatches(affiliateId),
    affiliateId ? `/api/admin/payouts/batches?affiliateId=${affiliateId}` : null
  );

  const { data: teamData, isLoading: teamLoading } = useTeamRoster(
    affiliateId,
    !!affiliateId
  );
  const { data: teamsData, isLoading: teamsLoading } = useTeams(
    affiliateId,
    !!affiliateId
  );

  async function refreshAffiliate() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.admin.affiliate(affiliateId),
    });
    await refetchAffiliate();
  }

  async function handleViewAsAffiliate() {
    try {
      const { redirectTo } = await apiFetch<{ redirectTo: string }>(
        "/api/admin/impersonate",
        {
          method: "POST",
          body: JSON.stringify({ affiliateId }),
        }
      );
      window.location.href = redirectTo ?? "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start preview");
    }
  }

  function focusLedger(status: LedgerTab) {
    setViewTab("ledger");
    setLedgerTab(status);
    setPage(1);
  }

  const displayName =
    affiliate?.displayName ?? affiliate?.email ?? "Affiliate";
  const ruleCount =
    (affiliate?.dealRules.asSponsor.length ?? 0) +
    (affiliate?.dealRules.asRecruit.length ?? 0);
  const teamCount =
    teamsData?.teams?.length ??
    (teamData?.team?.length ? 1 : 0);
  const canViewAsAffiliate =
    !!affiliate && affiliate.portal.hasAccess && !affiliate.portal.disabled;

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
                <Badge variant={affiliateStatusBadgeVariant(affiliate.status)}>
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
                    canViewAsAffiliate ? handleViewAsAffiliate : undefined
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
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      )}

      {affiliate && (
        <>
          <AffiliateLedgerStats summary={affiliate.ledger} onSelect={focusLedger} />

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <AffiliateProfileSidebar
              affiliate={affiliate}
              displayName={displayName}
              onUpdated={refreshAffiliate}
              onViewAsAffiliate={
                canViewAsAffiliate ? handleViewAsAffiliate : undefined
              }
            />

            <div className="flex-1 min-w-0">
              <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)} className="w-full">
                <TabsList className="mb-4 h-10 w-full justify-start overflow-x-auto overflow-y-hidden rounded-none border-b border-border bg-transparent p-0">
                  <TabsTrigger value="ledger" className={detailTabClass}>
                    <FileText className={detailTabIconClass} />
                    Ledger
                  </TabsTrigger>
                  <TabsTrigger value="payouts" className={detailTabClass}>
                    <DollarSign className={detailTabIconClass} />
                    Payouts
                  </TabsTrigger>
                  <TabsTrigger value="team" className={detailTabClass}>
                    <Users className={detailTabIconClass} />
                    Teams{teamCount > 0 ? ` (${teamCount})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="rules" className={detailTabClass}>
                    <Share2 className={detailTabIconClass} />
                    Deal rules{ruleCount > 0 ? ` (${ruleCount})` : ""}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ledger" className="mt-0">
                  <AffiliateLedgerTab
                    affiliateId={affiliateId}
                    summary={affiliate.ledger}
                    teams={teamsData?.teams}
                    ledgerTab={ledgerTab}
                    onLedgerTabChange={setLedgerTab}
                    teamFilter={teamFilter}
                    onTeamFilterChange={setTeamFilter}
                    page={page}
                    onPageChange={setPage}
                    q={q}
                    onSearchChange={setQ}
                  />
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
                  <AffiliateTeamsTab
                    affiliateId={affiliateId}
                    loading={teamsLoading || teamLoading}
                    teams={teamsData?.teams}
                    legacyTeam={teamData?.team}
                    onViewTeamLedger={(teamId) => {
                      setTeamFilter(teamId);
                      focusLedger("overrides");
                    }}
                  />
                </TabsContent>

                <TabsContent value="rules" className="mt-0">
                  <AffiliateRulesTab
                    affiliateId={affiliateId}
                    dealRules={affiliate.dealRules}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
