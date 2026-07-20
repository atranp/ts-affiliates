"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LedgerTable } from "@/components/LedgerTable";
import { TeamPanel, useTeam } from "@/components/TeamPanel";
import { ErrorState } from "@/components/admin/ErrorState";
import { FileText, Users, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency } from "@/lib/utils";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [viewTab, setViewTab] = useState<"overview" | "ledger" | "team">("overview");
  const [ledgerTab, setLedgerTab] = useState<"all" | "unpaid" | "paid" | "overrides">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
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
    page,
    limit: 50,
    enabled: !!user,
  });

  const { data: teamData, isLoading: teamLoading } = useTeam(undefined, !!user);

  function focusTeamMember(sourceId: string, status: "unpaid" | "paid" | "all") {
    setSourceFilter(sourceId);
    setLedgerTab(status === "all" ? "overrides" : status);
    setPage(1);
    setViewTab("ledger");
  }

  function handleTabChange(value: string) {
    setLedgerTab(value as typeof ledgerTab);
    setPage(1);
  }

  function handleSourceFilter(sourceId: string) {
    setSourceFilter(sourceId);
    setPage(1);
  }

  if (authLoading || (isLoading && !data)) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const hasTeamBonuses = (data?.teamBonuses.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">
          Welcome{user?.affiliateName ? `, ${user.affiliateName}` : ""}
        </h1>
        <p className="page-description">
          Your commissions and team bonuses. Payouts run weekly on Mondays.
        </p>
      </div>

      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {data && (
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as typeof viewTab)}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Ledger
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              My Team
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unpaid (all)</CardDescription>
                <CardTitle className="text-2xl font-semibold text-primary">
                  {formatCurrency(data.summary.unpaidTotal)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="unpaid">{data.summary.unpaidCount} entries</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Paid (all)</CardDescription>
                <CardTitle className="text-2xl text-success">
                  {formatCurrency(data.summary.paidTotal)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="paid">{data.summary.paidCount} entries</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pending</CardDescription>
                <CardTitle className="text-2xl text-warning">
                  {formatCurrency(data.summary.pendingTotal)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {hasTeamBonuses && (
            <Card className="border-primary/20 bg-primary-soft/30">
              <CardHeader>
                <CardTitle>Team bonuses</CardTitle>
                <CardDescription>
                  Your share of team members&apos; sales — paid out with Monday
                  affiliate payouts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Unpaid team bonuses</CardDescription>
                      <CardTitle className="text-xl text-primary">
                        {formatCurrency(data.overrideSummary.unpaidTotal)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="unpaid">
                        {data.overrideSummary.unpaidCount} due Monday
                      </Badge>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Paid team bonuses</CardDescription>
                      <CardTitle className="text-xl text-success">
                        {formatCurrency(data.overrideSummary.paidTotal)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="paid">
                        {data.overrideSummary.paidCount} paid out
                      </Badge>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-3">
                  {data.teamBonuses.map((bonus) => {
                    const name = bonus.displayName ?? bonus.email;
                    return (
                      <div
                        key={bonus.sourceAffiliateId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
                      >
                        <div>
                          <p className="font-medium">{name}&apos;s sales</p>
                          <p className="text-sm text-muted-foreground">
                            Team bonus from this recruit&apos;s referred orders
                            {bonus.milestone && !bonus.milestone.met && (
                              <>
                                {" · "}
                                Milestone{" "}
                                {formatCurrency(bonus.milestone.current)} /{" "}
                                {formatCurrency(bonus.milestone.threshold)}
                              </>
                            )}
                            {bonus.milestone?.met && " · Milestone reached"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              focusTeamMember(bonus.sourceAffiliateId, "unpaid")
                            }
                            className="filter-pill filter-pill-inactive hover:filter-pill-active"
                          >
                            Unpaid {formatCurrency(bonus.unpaidTotal)}
                          </button>
                          {bonus.pendingTotal > 0 && (
                            <span className="filter-pill filter-pill-inactive">
                              Pending {formatCurrency(bonus.pendingTotal)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              focusTeamMember(bonus.sourceAffiliateId, "paid")
                            }
                            className="filter-pill filter-pill-inactive hover:filter-pill-active"
                          >
                            Paid {formatCurrency(bonus.paidTotal)}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          </TabsContent>

          <TabsContent value="ledger" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Commission ledger</CardTitle>
                <CardDescription>
                Direct SliceWP commissions plus team bonus lines
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  placeholder="Search order ID or description..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="sm:max-w-sm"
                />
                {data.sourceAffiliates.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                      Filter by recruit:
                    </span>
                    <select
                      className="select-field w-full sm:max-w-xs"
                      value={sourceFilter}
                      onChange={(e) => handleSourceFilter(e.target.value)}
                    >
                      <option value="all">All team members</option>
                      {data.sourceAffiliates.map((affiliate) => (
                        <option key={affiliate.id} value={affiliate.id}>
                          {affiliate.displayName ?? affiliate.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <Tabs value={ledgerTab} onValueChange={handleTabChange}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                  <TabsTrigger value="paid">Paid</TabsTrigger>
                  <TabsTrigger value="overrides">Team bonuses</TabsTrigger>
                </TabsList>
                <TabsContent value={ledgerTab} className="space-y-4">
                  <LedgerTable entries={data.entries} showDetails />
                  {data.totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <p className="text-sm text-muted-foreground">
                        Page {data.page} of {data.totalPages} · {data.total}{" "}
                        entries
                        {isFetching ? " · updating..." : ""}
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

          <TabsContent value="team" className="mt-0 space-y-4">
            {teamLoading ? (
              <p className="text-sm text-muted-foreground">Loading team...</p>
            ) : teamData?.team && teamData.team.length > 0 ? (
              <TeamPanel team={teamData.team} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No team members</CardTitle>
                  <CardDescription>
                    You don&apos;t have any active recruits or downline affiliates yet.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
