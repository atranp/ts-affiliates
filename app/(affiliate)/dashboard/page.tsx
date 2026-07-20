"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LedgerTable } from "@/components/LedgerTable";
import { TeamPanel, useTeam } from "@/components/TeamPanel";
import { ErrorState } from "@/components/admin/ErrorState";
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
  const [tab, setTab] = useState<"all" | "unpaid" | "paid" | "overrides">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const tabFilters = ledgerTabToFilters(tab, sourceFilter);

  const { data, error, isLoading, refetch, isFetching } = useLedger({
    ...tabFilters,
    page,
    limit: 50,
    enabled: !!user,
  });

  const { data: teamData, isLoading: teamLoading } = useTeam(undefined, !!user);

  function focusTeamMember(sourceId: string, status: "unpaid" | "paid" | "all") {
    setSourceFilter(sourceId);
    setTab(status === "all" ? "overrides" : status);
    setPage(1);
  }

  function handleTabChange(value: string) {
    setTab(value as typeof tab);
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
    <div className="space-y-4">
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

      {teamLoading && (
        <p className="text-sm text-muted-foreground">Loading team...</p>
      )}
      {teamData?.team && teamData.team.length > 0 && (
        <TeamPanel team={teamData.team} />
      )}

      {data && (
        <>
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

          <Card>
            <CardHeader>
              <CardTitle>Commission ledger</CardTitle>
              <CardDescription>
                Direct SliceWP commissions plus team bonus lines
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.sourceAffiliates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSourceFilter("all")}
                    className={`filter-pill ${
                      sourceFilter === "all"
                        ? "filter-pill-active"
                        : "filter-pill-inactive"
                    }`}
                  >
                    All team members
                  </button>
                  {data.sourceAffiliates.map((affiliate) => (
                    <button
                      key={affiliate.id}
                      type="button"
                      onClick={() => handleSourceFilter(affiliate.id)}
                      className={`filter-pill ${
                        sourceFilter === affiliate.id
                          ? "filter-pill-active"
                          : "filter-pill-inactive"
                      }`}
                    >
                      {affiliate.displayName ?? affiliate.email}
                    </button>
                  ))}
                </div>
              )}

              <Tabs value={tab} onValueChange={handleTabChange}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                  <TabsTrigger value="paid">Paid</TabsTrigger>
                  <TabsTrigger value="overrides">Team bonuses</TabsTrigger>
                </TabsList>
                <TabsContent value={tab} className="space-y-4">
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
        </>
      )}
    </div>
  );
}
