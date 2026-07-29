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
import {
  Home,
  FileText,
  Users,
  DollarSign,
  ChevronRight,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <div>
        <h1 className="page-title">
          {displayName ? `Welcome, ${displayName}` : "Welcome"}
        </h1>
        <p className="page-description">{AFFILIATE_COPY.home.subtitle}</p>
      </div>

      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {data && (
        <Tabs
          value={viewTab}
          onValueChange={(v) => setViewTab(v as DashboardTab)}
        >
          <TabsList className="mb-2 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="gap-2 rounded-full border border-transparent px-4 py-2 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <Home className="h-4 w-4" />
              {AFFILIATE_COPY.tabs.home}
            </TabsTrigger>
            <TabsTrigger
              value="ledger"
              className="gap-2 rounded-full border border-transparent px-4 py-2 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <FileText className="h-4 w-4" />
              {AFFILIATE_COPY.tabs.commissions}
            </TabsTrigger>
            <TabsTrigger
              value="teams"
              className="gap-2 rounded-full border border-transparent px-4 py-2 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <Users className="h-4 w-4" />
              {AFFILIATE_COPY.tabs.team}
              {teamsData?.teams && teamsData.teams.length > 0
                ? ` · ${teamsData.teams.length}`
                : ""}
            </TabsTrigger>
            <TabsTrigger
              value="payouts"
              className="gap-2 rounded-full border border-transparent px-4 py-2 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <DollarSign className="h-4 w-4" />
              {AFFILIATE_COPY.tabs.payouts}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.owed.label}
                hint={AFFILIATE_COPY.stats.owed.hint}
                value={data.summary.unpaidTotal}
                tone="primary"
              />
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.paid.label}
                hint={AFFILIATE_COPY.stats.paid.hint}
                value={data.summary.paidTotal}
                tone="success"
              />
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.pending.label}
                hint={AFFILIATE_COPY.stats.pending.hint}
                value={data.summary.pendingTotal}
                tone="warning"
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

          <TabsContent value="ledger" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {AFFILIATE_COPY.commissions.title}
                </CardTitle>
                <CardDescription>
                  {AFFILIATE_COPY.commissions.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    placeholder={AFFILIATE_COPY.commissions.searchPlaceholder}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="sm:max-w-sm bg-background"
                  />
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
                      onChange={(e) => handleSourceFilter(e.target.value)}
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

                <Tabs value={ledgerTab} onValueChange={handleTabChange}>
                  <TabsList className="h-auto flex-wrap">
                    <TabsTrigger value="all">
                      {AFFILIATE_COPY.commissions.tabs.all}
                    </TabsTrigger>
                    <TabsTrigger value="unpaid">
                      {AFFILIATE_COPY.commissions.tabs.owed}
                    </TabsTrigger>
                    <TabsTrigger value="paid">
                      {AFFILIATE_COPY.commissions.tabs.paid}
                    </TabsTrigger>
                    <TabsTrigger value="overrides">
                      {AFFILIATE_COPY.commissions.tabs.teamEarnings}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value={ledgerTab} className="space-y-4 pt-2">
                    <LedgerTable
                      entries={data.entries}
                      showDetails
                      affiliateView
                    />
                    {data.totalPages > 1 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <p className="text-sm text-muted-foreground">
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams" className="mt-4 space-y-4">
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

          <TabsContent value="payouts" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {AFFILIATE_COPY.payouts.title}
                </CardTitle>
                <CardDescription>
                  {AFFILIATE_COPY.payouts.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PayoutsList
                  detailHrefPrefix="/dashboard/payouts"
                  affiliateView
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
