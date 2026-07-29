"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AffiliateStatCard } from "@/components/affiliate/AffiliateStatCard";
import { DashboardSkeleton } from "@/components/affiliate/DashboardSkeleton";
import { MilestoneProgress } from "@/components/affiliate/MilestoneProgress";
import { LedgerTable } from "@/components/LedgerTable";
import { TeamsPanel, useTeams } from "@/components/TeamsPanel";
import { TeamPanel, useTeam } from "@/components/TeamPanel";
import { ErrorState } from "@/components/admin/ErrorState";
import { PartnerTabRail } from "@/components/layout/PartnerTabRail";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ledgerTabToFilters, useLedger } from "@/hooks/use-ledger";
import { PayoutsList } from "@/components/payouts/PayoutsList";
import {
  AFFILIATE_COPY,
  memberCountLabel,
} from "@/lib/affiliate/copy";
import { formatCurrency } from "@/lib/utils";

type DashboardTab = "overview" | "ledger" | "teams" | "payouts";

function resolveInitialTab(tab: string | null): DashboardTab {
  if (tab === "commissions" || tab === "ledger") return "ledger";
  if (tab === "teams" || tab === "payouts") return tab;
  return "overview";
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const { user, loading: authLoading } = useAuth();
  const [viewTab, setViewTab] = useState<DashboardTab>(resolveInitialTab(initialTab));
  const [ledgerTab, setLedgerTab] = useState<
    "all" | "unpaid" | "paid" | "overrides"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const tabFilters = ledgerTabToFilters(ledgerTab, sourceFilter);

  const { data, error, isLoading, refetch, isFetching } = useLedger({
    ...tabFilters,
    q: debouncedQ,
    teamId: teamFilter !== "all" ? teamFilter : undefined,
    page,
    limit: 50,
    enabled: !!user,
  });

  const { data: teamsData, isLoading: teamsLoading } = useTeams(
    undefined,
    !!user
  );
  const { data: legacyTeamData } = useTeam(undefined, !!user);

  function focusTeamMember(
    sourceId: string,
    status: "unpaid" | "paid" | "all"
  ) {
    setTeamFilter("all");
    setSourceFilter(sourceId);
    setLedgerTab(status === "all" ? "overrides" : status);
    setPage(1);
    setViewTab("ledger");
  }

  function focusTeam(teamId: string) {
    setSourceFilter("all");
    setTeamFilter(teamId);
    setLedgerTab("overrides");
    setPage(1);
    setViewTab("ledger");
  }

  function handleTeamFilter(value: string) {
    setTeamFilter(value);
    if (value !== "all") setSourceFilter("all");
    setPage(1);
  }

  function handleTabChange(value: string) {
    setLedgerTab(value as typeof ledgerTab);
    setPage(1);
  }

  function handleSourceFilter(sourceId: string) {
    setSourceFilter(sourceId);
    setPage(1);
  }

  const displayName =
    user?.affiliateName?.trim() || user?.name?.trim() || null;

  if (authLoading || (isLoading && !data)) {
    return <DashboardSkeleton />;
  }

  const hasTeams = (teamsData?.teams.length ?? 0) > 0;
  const hasTeamBonuses = (data?.teamBonuses.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {data && (
        <Tabs
          value={viewTab}
          onValueChange={(v) => setViewTab(v as DashboardTab)}
        >
          <PartnerTabRail
            activeTab={viewTab}
            onTabChange={(v) => setViewTab(v as DashboardTab)}
            tabs={[
              {
                id: "overview",
                label: AFFILIATE_COPY.tabs.home,
                icon: LayoutDashboard,
              },
              {
                id: "ledger",
                label: AFFILIATE_COPY.tabs.commissions,
                icon: Receipt,
              },
              {
                id: "teams",
                label: AFFILIATE_COPY.tabs.team,
                icon: Users,
                suffix:
                  teamsData?.teams && teamsData.teams.length > 0
                    ? ` · ${teamsData.teams.length}`
                    : undefined,
              },
              {
                id: "payouts",
                label: AFFILIATE_COPY.tabs.payouts,
                icon: CreditCard,
              },
            ]}
          />

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div>
              <h1 className="page-title">
                {displayName ? `Welcome, ${displayName}` : "Welcome"}
              </h1>
              <p className="page-description">{AFFILIATE_COPY.home.subtitle}</p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.owed.label}
                hint={AFFILIATE_COPY.stats.owed.hint}
                value={data.summary.unpaidTotal}
                tone="primary"
                icon={DollarSign}
                actionLabel="View"
                onAction={() => setViewTab("ledger")}
              />
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.paid.label}
                hint={AFFILIATE_COPY.stats.paid.hint}
                value={data.summary.paidTotal}
                tone="success"
                icon={CheckCircle2}
                actionLabel="Payouts"
                onAction={() => setViewTab("payouts")}
              />
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.pending.label}
                hint={AFFILIATE_COPY.stats.pending.hint}
                value={data.summary.pendingTotal}
                tone="warning"
                icon={Clock}
                actionLabel="Team"
                onAction={() => setViewTab("teams")}
              />
            </div>

            {hasTeams ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
                  <div>
                    <CardTitle className="text-base">
                      {AFFILIATE_COPY.home.teamsTitle}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Earnings from people you&apos;ve brought on
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1 text-primary"
                    onClick={() => setViewTab("teams")}
                  >
                    {AFFILIATE_COPY.home.teamsAction}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {teamsData!.teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setViewTab("teams")}
                        className="rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary-soft/20"
                      >
                        <p className="font-medium">{team.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {memberCountLabel(team.memberCount)}
                        </p>
                        <div className="mt-3 space-y-1">
                          <p className="text-sm">
                            <span className="text-muted-foreground">
                              {AFFILIATE_COPY.team.owed}:{" "}
                            </span>
                            <span className="font-semibold text-primary">
                              {formatCurrency(team.stats.unpaidTeamBonus)}
                            </span>
                          </p>
                          {team.stats.pendingTeamBonus > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {AFFILIATE_COPY.team.pending}{" "}
                              {formatCurrency(team.stats.pendingTeamBonus)}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : hasTeamBonuses ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {AFFILIATE_COPY.home.teamEarningsTitle}
                  </CardTitle>
                  <CardDescription>
                    Bonuses earned from your team members&apos; sales
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AffiliateStatCard
                      label={AFFILIATE_COPY.team.owed}
                      hint={AFFILIATE_COPY.stats.owed.hint}
                      value={data.overrideSummary.unpaidTotal}
                      tone="primary"
                    />
                    <AffiliateStatCard
                      label={AFFILIATE_COPY.team.paid}
                      hint={AFFILIATE_COPY.stats.paid.hint}
                      value={data.overrideSummary.paidTotal}
                      tone="success"
                    />
                  </div>

                  <div className="space-y-3">
                    {data.teamBonuses.map((bonus) => {
                      const name = bonus.displayName ?? bonus.email;

                      return (
                        <div
                          key={bonus.sourceAffiliateId}
                          className="rounded-lg border border-border bg-background p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{name}</p>
                              <p className="text-xs text-muted-foreground">
                                Team member
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-sm">
                              {bonus.unpaidTotal > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    focusTeamMember(
                                      bonus.sourceAffiliateId,
                                      "unpaid"
                                    )
                                  }
                                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                                >
                                  {AFFILIATE_COPY.team.owed}{" "}
                                  {formatCurrency(bonus.unpaidTotal)}
                                </button>
                              )}
                              {bonus.pendingTotal > 0 && (
                                <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                                  {AFFILIATE_COPY.team.pending}{" "}
                                  {formatCurrency(bonus.pendingTotal)}
                                </span>
                              )}
                              {bonus.paidTotal > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    focusTeamMember(
                                      bonus.sourceAffiliateId,
                                      "paid"
                                    )
                                  }
                                  className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success hover:bg-success/15"
                                >
                                  {AFFILIATE_COPY.team.paid}{" "}
                                  {formatCurrency(bonus.paidTotal)}
                                </button>
                              )}
                            </div>
                          </div>

                          {bonus.milestone && (
                            <MilestoneProgress
                              current={bonus.milestone.current}
                              threshold={bonus.milestone.threshold}
                              remaining={bonus.milestone.remaining}
                              met={bonus.milestone.met}
                              compact
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="ledger" className="mt-6 space-y-6">
            <div>
              <h1 className="page-title">Commissions Ledger</h1>
              <p className="page-description">
                {AFFILIATE_COPY.commissions.description}
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <div className="ts-table-toolbar">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={
                        AFFILIATE_COPY.commissions.searchPlaceholder
                      }
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="rounded-lg bg-card pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {teamsData?.teams && teamsData.teams.length > 0 && (
                      <select
                        className="select-field w-full sm:max-w-xs"
                        value={teamFilter}
                        onChange={(e) => handleTeamFilter(e.target.value)}
                      >
                        <option value="all">
                          {AFFILIATE_COPY.commissions.allTeams}
                        </option>
                        {teamsData.teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {data.sourceAffiliates.length > 0 && (
                      <select
                        className="select-field w-full sm:max-w-xs"
                        value={sourceFilter}
                        onChange={(e) =>
                          handleSourceFilter(e.target.value)
                        }
                      >
                        <option value="all">
                          {AFFILIATE_COPY.commissions.allMembers}
                        </option>
                        {data.sourceAffiliates.map((affiliate) => (
                          <option key={affiliate.id} value={affiliate.id}>
                            {affiliate.displayName ?? affiliate.email}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <Tabs value={ledgerTab} onValueChange={handleTabChange}>
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    {(
                      [
                        ["all", AFFILIATE_COPY.commissions.tabs.all],
                        ["unpaid", AFFILIATE_COPY.commissions.tabs.owed],
                        ["paid", AFFILIATE_COPY.commissions.tabs.paid],
                        [
                          "overrides",
                          AFFILIATE_COPY.commissions.tabs.teamEarnings,
                        ],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleTabChange(value)}
                        className={
                          ledgerTab === value
                            ? "filter-pill filter-pill-active"
                            : "filter-pill filter-pill-inactive"
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <TabsContent value={ledgerTab} className="mt-0">
                    <LedgerTable
                      entries={data.entries}
                      showDetails
                      affiliateView
                    />
                    {data.totalPages > 1 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/50 p-4 text-xs text-muted-foreground">
                        <p>
                          Page {data.page} of {data.totalPages} · {data.total}{" "}
                          {data.total === 1 ? "entry" : "entries"}
                          {isFetching ? " · updating…" : ""}
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
                            disabled={page >= data.totalPages}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="teams" className="mt-6 space-y-6">
            <div>
              <h1 className="page-title">Your Team Roster</h1>
              <p className="page-description">
                Manage sponsored affiliates, track milestone sales goals, and
                monitor team earnings.
              </p>
            </div>
            {teamsLoading ? (
              <p className="text-sm text-muted-foreground">
                {AFFILIATE_COPY.team.loading}
              </p>
            ) : teamsData?.teams && teamsData.teams.length > 0 ? (
              <TeamsPanel
                teams={teamsData.teams}
                onViewLedger={(memberId) =>
                  focusTeamMember(memberId, "unpaid")
                }
                onViewTeamLedger={focusTeam}
              />
            ) : legacyTeamData?.team && legacyTeamData.team.length > 0 ? (
              <TeamPanel team={legacyTeamData.team} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{AFFILIATE_COPY.team.title}</CardTitle>
                  <CardDescription>
                    {AFFILIATE_COPY.team.empty}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="payouts" className="mt-6 space-y-6">
            <div>
              <h1 className="page-title">Payout History</h1>
              <p className="page-description">
                {AFFILIATE_COPY.payouts.description}
              </p>
            </div>
            <PayoutsList
              detailHrefPrefix="/dashboard/payouts"
              affiliateView
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
