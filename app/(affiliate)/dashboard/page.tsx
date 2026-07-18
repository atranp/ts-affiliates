"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LedgerTable } from "@/components/LedgerTable";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";

type LedgerResponse = {
  entries: Array<{
    id: string;
    type: string;
    amount: string;
    status: string;
    description: string | null;
    wooOrderId: number | null;
    orderRevenue: string | null;
    payoutWeek: string | null;
    paidAt: string | null;
    createdAt: string;
    sourceAffiliateId: string | null;
    sourceAffiliate?: {
      displayName: string | null;
      email: string;
    } | null;
  }>;
  summary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
  };
  sourceAffiliates: Array<{
    id: string;
    displayName: string | null;
    email: string;
  }>;
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [tab, setTab] = useState<"all" | "unpaid" | "paid" | "overrides">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ledger");
        if (!res.ok) {
          const body = await res.json();
          setFetchError(body.error ?? "Failed to load ledger");
          return;
        }
        setData(await res.json());
      } catch {
        setFetchError("Failed to load ledger");
      }
    }

    if (user) load();
  }, [user]);

  const filteredEntries = useMemo(() => {
    if (!data) return [];

    return data.entries.filter((entry) => {
      if (tab === "unpaid" && entry.status !== "UNPAID") return false;
      if (tab === "paid" && entry.status !== "PAID") return false;
      if (tab === "overrides" && entry.type !== "OVERRIDE") return false;
    if (sourceFilter !== "all" && entry.sourceAffiliateId !== sourceFilter) {
      return false;
    }
      return true;
    });
  }, [data, tab, sourceFilter]);

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">
          Welcome{user?.affiliateName ? `, ${user.affiliateName}` : ""}
        </h1>
        <p className="page-description">
          Track your commissions and team overrides. Payouts run weekly on Mondays.
        </p>
      </div>

      {fetchError && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{fetchError}</CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unpaid</CardDescription>
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
                <CardDescription>Paid</CardDescription>
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

          <Card>
            <CardHeader>
              <CardTitle>Commission Ledger</CardTitle>
              <CardDescription>
                Direct commissions from SliceWP and custom team overrides
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.sourceAffiliates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSourceFilter("all")}
                    className={`filter-pill ${
                      sourceFilter === "all"
                        ? "filter-pill-active"
                        : "filter-pill-inactive"
                    }`}
                  >
                    All recruits
                  </button>
                  {data.sourceAffiliates.map((affiliate) => (
                    <button
                      key={affiliate.id}
                      type="button"
                      onClick={() => setSourceFilter(affiliate.id)}
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

              <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                  <TabsTrigger value="paid">Paid</TabsTrigger>
                  <TabsTrigger value="overrides">Team Overrides</TabsTrigger>
                </TabsList>
                <TabsContent value={tab}>
                  <LedgerTable entries={filteredEntries} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
