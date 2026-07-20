"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { UserPlus, FileText, Users, Share2, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard, StatCardSkeleton } from "@/components/admin/StatCard";
import { ErrorState } from "@/components/admin/ErrorState";
import { EmptyState } from "@/components/admin/EmptyState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { LedgerTable } from "@/components/LedgerTable";
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
import { adminMutate, useAdminAffiliate } from "@/hooks/use-admin-query";
import { ledgerTabToFilters, useLedger } from "@/hooks/use-ledger";
import { TeamPanel, useTeam } from "@/components/TeamPanel";
import type {
  AdminAffiliateDetail,
  InviteAffiliateResult,
} from "@/lib/admin/types";
import { formatCurrency } from "@/lib/utils";

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
  const params = useParams<{ id: string }>();
  const affiliateId = params.id;
  const queryClient = useQueryClient();

  const {
    data: affiliate,
    error: affiliateError,
    isLoading: affiliateLoading,
    refetch: refetchAffiliate,
  } = useAdminAffiliate(affiliateId);

  const [viewTab, setViewTab] = useState<"ledger" | "team" | "rules">("ledger");
  const [ledgerTab, setLedgerTab] = useState<"all" | "unpaid" | "paid" | "overrides">("all");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

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
    page,
    limit: 50,
    enabled: !!affiliateId,
  });

  const { data: teamData, isLoading: teamLoading } = useTeam(
    affiliateId,
    !!affiliateId
  );

  async function handleInvite() {
    setInviting(true);
    try {
      const result = await adminMutate<InviteAffiliateResult>(
        `/api/admin/affiliates/${affiliateId}/invite`,
        { method: "POST" }
      );

      if (result.created && result.temporaryPassword) {
        toast.success("Portal login created", {
          description: `Temp password: ${result.temporaryPassword} — no email sent. Share manually.`,
          duration: 15000,
        });
      } else if (result.linked) {
        toast.success("Portal access linked", {
          description: `${result.email} can sign in to the affiliate dashboard.`,
        });
      }

      setInviteOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "affiliate", affiliateId],
      });
      await refetchAffiliate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  const displayName =
    affiliate?.displayName ?? affiliate?.email ?? "Affiliate";

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/admin/affiliates" className="hover:text-foreground hover:underline transition-colors">
            Affiliates
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">
            {affiliate ? (affiliate.displayName ?? "Details") : "Loading..."}
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
              <div className="flex items-center gap-2">
                <Badge variant={statusBadgeVariant(affiliate.status)}>
                  {affiliate.status}
                </Badge>
                {affiliate.commissionRate && (
                  <Badge variant="secondary">
                    {affiliate.commissionRate}% base rate
                  </Badge>
                )}
                {!affiliate.profile && (
                  <Button size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Set up portal access
                  </Button>
                )}
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
            <StatCard
              label="Unpaid"
              value={formatCurrency(affiliate.ledger.unpaidTotal)}
              hint={`${affiliate.ledger.unpaidCount} entries`}
              variant="primary"
            />
            <StatCard
              label="Paid"
              value={formatCurrency(affiliate.ledger.paidTotal)}
              hint={`${affiliate.ledger.paidCount} entries`}
              variant="success"
            />
            <StatCard
              label="Pending"
              value={formatCurrency(affiliate.ledger.pendingTotal)}
              variant="warning"
            />
            <StatCard
              label="Overrides"
              value={formatCurrency(affiliate.ledger.overrideTotal)}
              hint={`${affiliate.ledger.overrideCount} override entries`}
            />
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            {/* Left Sidebar */}
            <div className="flex w-full flex-col gap-4 lg:sticky lg:top-8 lg:w-80 lg:shrink-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">SliceWP profile</CardTitle>
                  <CardDescription>Read-only — updated on sync</CardDescription>
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Portal access</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {affiliate.profile ? (
                    <>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">User</span>
                        <span className="font-medium">{affiliate.profile.name}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Login email</span>
                        <span className="font-medium">{affiliate.profile.email}</span>
                      </div>
                      <div className="flex justify-between gap-4 border-t pt-3">
                        <span className="text-muted-foreground">Role</span>
                        <span className="font-medium">{affiliate.profile.role}</span>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-muted-foreground">
                        This affiliate cannot sign in yet. Create a portal login using
                        their SliceWP email.
                      </p>
                      <Button variant="secondary" className="w-full" onClick={() => setInviteOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create login
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
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
                    value="team" 
                    className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Team {teamData?.team && `(${teamData.team.length})`}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="rules" 
                    className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Deal rules {(affiliate.dealRules.asSponsor.length + affiliate.dealRules.asRecruit.length > 0) && `(${affiliate.dealRules.asSponsor.length + affiliate.dealRules.asRecruit.length})`}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ledger" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Commission ledger</CardTitle>
                      <CardDescription>
                        Direct commissions and team overrides
                      </CardDescription>
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
                          <Input
                            placeholder="Search order ID or description..."
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            className="max-w-sm"
                          />
                          <Tabs
                            value={ledgerTab}
                            onValueChange={(v) => {
                              setLedgerTab(v as typeof ledgerTab);
                              setPage(1);
                            }}
                          >
                          <TabsList>
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                            <TabsTrigger value="paid">Paid</TabsTrigger>
                            <TabsTrigger value="overrides">Overrides</TabsTrigger>
                          </TabsList>
                          <TabsContent value={ledgerTab} className="space-y-4">
                            {ledger.entries.length === 0 ? (
                              <EmptyState
                                title="No ledger entries"
                                description="Run a sync to import commissions from SliceWP."
                              />
                            ) : (
                              <>
                                <LedgerTable entries={ledger.entries} />
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

                <TabsContent value="team" className="mt-0 space-y-4">
                  {teamLoading ? (
                    <p className="text-sm text-muted-foreground">Loading team...</p>
                  ) : teamData?.team && teamData.team.length > 0 ? (
                    <TeamPanel team={teamData.team} adminView />
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>No team members</CardTitle>
                        <CardDescription>
                          This affiliate has no active recruits and no downline affiliates.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="rules" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Deal rules</CardTitle>
                      <CardDescription>
                        Override rules involving this affiliate
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {affiliate.dealRules.asSponsor.length === 0 && affiliate.dealRules.asRecruit.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No active or inactive rules found.
                        </p>
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

      <ConfirmDialog
        open={inviteOpen}
        title="Set up portal access?"
        description={`Creates a login for ${affiliate?.email ?? "this affiliate"} with a temporary password. No email is sent — share credentials manually.`}
        confirmLabel="Create login"
        loading={inviting}
        onConfirm={handleInvite}
        onCancel={() => setInviteOpen(false)}
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
              {rule.counterparty?.displayName ?? rule.counterparty?.email ?? "—"}
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
