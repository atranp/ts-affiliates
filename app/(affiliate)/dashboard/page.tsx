"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AffiliateStatCard } from "@/components/affiliate/AffiliateStatCard";
import { DashboardSkeleton } from "@/components/affiliate/DashboardSkeleton";
import { MilestoneProgress } from "@/components/affiliate/MilestoneProgress";
import { CommissionsPanel, type CommissionsTab } from "@/components/CommissionsPanel";
import { TeamsPanel, useTeams } from "@/components/TeamsPanel";
import { TeamPanel, useTeam } from "@/components/TeamPanel";
import { ErrorState } from "@/components/admin/ErrorState";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
} from "lucide-react";
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
import { AFFILIATE_COPY, memberCountLabel } from "@/lib/affiliate/copy";
import { formatCurrency } from "@/lib/utils";

type DashboardTab = "overview" | "ledger" | "teams" | "payouts";
type LedgerStatusTab = CommissionsTab;

const DASHBOARD_TABS: DashboardTab[] = [
  "overview",
  "ledger",
  "teams",
  "payouts",
];
const LEDGER_TABS: LedgerStatusTab[] = [
  "all",
  "unpaid",
  "paid",
  "overrides",
  "pending",
];

function resolveTab(value: string | null): DashboardTab {
  if (value === "commissions") return "ledger";
  return DASHBOARD_TABS.find((tab) => tab === value) ?? "overview";
}

function resolveLedgerTab(value: string | null): LedgerStatusTab {
  return LEDGER_TABS.find((tab) => tab === value) ?? "all";
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  /**
   * The URL is the single source of truth for navigation state so refreshes,
   * the back button, and shared links all land where the user expects.
   * Tab moves go into history; filter tweaks replace so they don't flood it.
   */
  const setParams = useCallback(
    (
      updates: Record<string, string | null>,
      { history = false }: { history?: boolean } = {}
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (history) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const viewTab = resolveTab(searchParams.get("tab"));
  const ledgerTab = resolveLedgerTab(searchParams.get("status"));
  const sourceFilter = searchParams.get("member") ?? "all";
  const teamFilter = searchParams.get("team") ?? "all";
  const urlQuery = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  // Typing stays local for responsiveness, then lands in the URL once settled.
  const [q, setQ] = useState(urlQuery);
  const lastWritten = useRef(urlQuery);

  // Adopt query changes we did not cause, so back/forward and "clear filters"
  // are not immediately overwritten by the pending debounce.
  useEffect(() => {
    if (urlQuery !== lastWritten.current) {
      lastWritten.current = urlQuery;
      setQ(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    if (q === urlQuery) return;
    const timer = setTimeout(() => {
      lastWritten.current = q;
      setParams({ q: q || null, page: null });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, urlQuery, setParams]);

  const tabFilters = ledgerTabToFilters(ledgerTab, sourceFilter);

  const { data, error, isLoading, refetch, isFetching } = useLedger({
    ...tabFilters,
    q: urlQuery,
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

  function setViewTab(tab: string) {
    setParams({ tab: tab === "overview" ? null : tab }, { history: true });
  }

  function focusTeamMember(sourceId: string, status: "unpaid" | "paid" | "all") {
    setParams(
      {
        tab: "ledger",
        team: null,
        member: sourceId,
        status: status === "all" ? "overrides" : status,
        page: null,
      },
      { history: true }
    );
  }

  function focusTeam(teamId: string) {
    setParams(
      {
        tab: "ledger",
        member: null,
        team: teamId,
        status: "overrides",
        page: null,
      },
      { history: true }
    );
  }

  function handleTeamFilter(value: string) {
    setParams({
      team: value === "all" ? null : value,
      // A team and a single member are mutually exclusive narrowings.
      ...(value === "all" ? {} : { member: null }),
      page: null,
    });
  }

  function handleSourceFilter(value: string) {
    setParams({ member: value === "all" ? null : value, page: null });
  }

  function handleLedgerTab(value: CommissionsTab) {
    setParams({ status: value === "all" ? null : value, page: null });
  }

  function handleLedgerPageChange(nextPage: number) {
    setParams({
      page: nextPage <= 1 ? null : String(nextPage),
    });
  }

  function clearLedgerFilters() {
    setQ("");
    setParams({ status: null, member: null, team: null, q: null, page: null });
  }

  const displayName = user?.affiliateName?.trim() || user?.name?.trim() || null;

  if (authLoading || (isLoading && !data)) {
    return <DashboardSkeleton />;
  }

  const hasTeams = (teamsData?.teams.length ?? 0) > 0;
  const hasTeamBonuses = (data?.teamBonuses.length ?? 0) > 0;
  const filtersActive =
    ledgerTab !== "all" ||
    sourceFilter !== "all" ||
    teamFilter !== "all" ||
    urlQuery !== "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {data && (
        <Tabs
          value={viewTab}
          onValueChange={setViewTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsContent value="overview" className="space-y-6">
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
                actionLabel={AFFILIATE_COPY.stats.owed.action}
                onAction={() => setViewTab("ledger")}
              />
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.paid.label}
                hint={AFFILIATE_COPY.stats.paid.hint}
                value={data.summary.paidTotal}
                tone="success"
                icon={CheckCircle2}
                actionLabel={AFFILIATE_COPY.stats.paid.action}
                onAction={() => setViewTab("payouts")}
              />
              <AffiliateStatCard
                label={AFFILIATE_COPY.stats.pending.label}
                hint={AFFILIATE_COPY.stats.pending.hint}
                value={data.summary.pendingTotal}
                tone="warning"
                icon={Clock}
                actionLabel={AFFILIATE_COPY.stats.pending.action}
                onAction={() => setViewTab("teams")}
              />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
                <div>
                  <CardTitle className="text-base">
                    {AFFILIATE_COPY.home.payoutsTitle}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {AFFILIATE_COPY.home.payoutsDescription}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1 text-primary"
                  onClick={() => setViewTab("payouts")}
                >
                  {AFFILIATE_COPY.home.payoutsAction}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <PayoutsList
                  detailHrefPrefix="/dashboard/payouts"
                  affiliateView
                  embedded
                  limit={5}
                  onViewAll={() => setViewTab("payouts")}
                />
              </CardContent>
            </Card>

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
                        onClick={() => focusTeam(team.id)}
                        className="rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <p className="font-medium">{team.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {memberCountLabel(team.memberCount)}
                        </p>
                        <div className="mt-3 space-y-1">
                          <p className="text-sm">
                            <span className="text-muted-foreground">
                              {AFFILIATE_COPY.team.payout}:{" "}
                            </span>
                            <span className="font-semibold text-primary">
                              {formatCurrency(team.stats.unpaidTeamBonus)}
                            </span>
                          </p>
                          {team.stats.pendingTeamBonus > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {AFFILIATE_COPY.team.awaitingMilestone}{" "}
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
                      label={AFFILIATE_COPY.team.payout}
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
                                  {AFFILIATE_COPY.team.payout}{" "}
                                  {formatCurrency(bonus.unpaidTotal)}
                                </button>
                              )}
                              {bonus.pendingTotal > 0 && (
                                <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                                  {AFFILIATE_COPY.team.awaitingMilestone}{" "}
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

          <TabsContent
            value="ledger"
            className="ts-workspace mt-0 flex min-h-0 flex-1 flex-col gap-5"
          >
            <div className="shrink-0">
              <h1 className="page-title">{AFFILIATE_COPY.commissions.title}</h1>
              <p className="page-description">
                {AFFILIATE_COPY.commissions.description}
              </p>
            </div>

            <CommissionsPanel
              data={data}
              teams={teamsData?.teams}
              ledgerTab={ledgerTab}
              sourceFilter={sourceFilter}
              teamFilter={teamFilter}
              q={q}
              page={page}
              isFetching={isFetching}
              filtersActive={filtersActive}
              onLedgerTab={handleLedgerTab}
              onTeamFilter={handleTeamFilter}
              onSourceFilter={handleSourceFilter}
              onSearchChange={setQ}
              onClearFilters={clearLedgerFilters}
              onPageChange={handleLedgerPageChange}
              fillHeight
              className="min-h-0 flex-1"
            />
          </TabsContent>

          <TabsContent value="teams" className="mt-4 flex min-h-0 flex-1 flex-col gap-5">
            <div className="shrink-0">
              <h1 className="page-title">Your Team Roster</h1>
              <p className="page-description">
                Track sales goals, team earnings, and who&apos;s producing.
              </p>
            </div>
            {teamsLoading ? (
              <p className="text-sm text-muted-foreground">
                {AFFILIATE_COPY.team.loading}
              </p>
            ) : teamsData?.teams && teamsData.teams.length > 0 ? (
              <TeamsPanel
                teams={teamsData.teams}
                onViewLedger={(memberId) => focusTeamMember(memberId, "unpaid")}
                onViewTeamLedger={focusTeam}
                fillHeight
                className="min-h-0 flex-1"
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

          <TabsContent value="payouts" className="space-y-6">
            <div>
              <h1 className="page-title">Payout History</h1>
              <p className="page-description">
                {AFFILIATE_COPY.payouts.description}
              </p>
            </div>
            <PayoutsList detailHrefPrefix="/dashboard/payouts" affiliateView />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
