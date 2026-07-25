"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, DollarSign, GitBranch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { SetupFlowCard } from "@/components/admin/SetupFlowCard";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/admin/ErrorState";
import { EmptyState } from "@/components/admin/EmptyState";
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

type AdminTeamRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sponsorAffiliateId: string;
  sponsorAffiliate: {
    id: string;
    displayName: string | null;
    email: string;
  };
  ruleCount: number;
};

export default function AdminTeamsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-6">Loading teams...</p>}>
      <AdminTeamsPageContent />
    </Suspense>
  );
}

function AdminTeamsPageContent() {
  const searchParams = useSearchParams();
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useAdminQuery<{ teams: AdminTeamRow[] }>(
    ["admin", "teams-all"],
    "/api/admin/teams"
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sponsor, setSponsor] = useState<AffiliateOption | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [deletingTeam, setDeletingTeam] = useState<AdminTeamRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [urlPrefilled, setUrlPrefilled] = useState(false);

  useEffect(() => {
    if (urlPrefilled) return;
    const sponsorId = searchParams.get("sponsorId");
    const shouldOpen = searchParams.get("create") === "1" || sponsorId;

    async function prefillFromUrl() {
      try {
        if (sponsorId) {
          const affiliate = await apiFetch<{
            id: string;
            email: string;
            displayName: string | null;
            slicewpId: number;
            status: string;
          }>(`/api/admin/affiliates/${sponsorId}`);
          setSponsor({
            id: affiliate.id,
            email: affiliate.email,
            displayName: affiliate.displayName,
            slicewpId: affiliate.slicewpId,
            status: affiliate.status,
          });
        }
        if (shouldOpen) setCreateOpen(true);
      } catch {
        // ignore
      } finally {
        setUrlPrefilled(true);
      }
    }

    if (sponsorId) prefillFromUrl();
    else setUrlPrefilled(true);
  }, [searchParams, urlPrefilled]);

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!sponsor?.id || !form.name.trim()) {
      toast.error("Select sponsor and enter a team name");
      return;
    }

    setSubmitting(true);
    try {
      await adminMutate("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          sponsorAffiliateId: sponsor.id,
        }),
      });
      toast.success(`Created team: ${form.name}`);
      setForm({ name: "", description: "" });
      setSponsor(null);
      setCreateOpen(false);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deletingTeam) return;
    setDeleting(true);
    try {
      await adminMutate(`/api/admin/teams/${deletingTeam.id}`, {
        method: "DELETE",
      });
      toast.success(`Deleted team: ${deletingTeam.name}`);
      setDeletingTeam(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Step 1 — group recruits under a sponsor before assigning deal rules"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create team
          </Button>
        }
      />

      <SetupFlowCard />

      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>All teams</CardTitle>
          <CardDescription>
            Assign deal rules to a team when creating or editing rules. Affiliates
            see their teams on the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <TableSkeleton columns={5} />}
          {!isLoading && data?.teams.length === 0 && (
            <EmptyState
              title="No teams yet"
              description="Create a team for a sponsor affiliate, then assign deal rules to it."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first team
                </Button>
              }
            />
          )}
          {!isLoading && data && data.teams.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell>
                      <p className="font-medium">{team.name}</p>
                      {team.description && (
                        <p className="text-xs text-muted-foreground">
                          {team.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/affiliates/${team.sponsorAffiliateId}`}
                        className="text-primary hover:underline"
                      >
                        {team.sponsorAffiliate.displayName ??
                          team.sponsorAffiliate.email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {team.ruleCount === 0 ? (
                        <Link
                          href={`/admin/deal-rules?teamId=${team.id}&sponsorId=${team.sponsorAffiliateId}`}
                          className="text-primary text-sm hover:underline"
                        >
                          Add rules →
                        </Link>
                      ) : (
                        team.ruleCount
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={team.active ? "paid" : "secondary"}>
                        {team.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Run payout for this team"
                        >
                          <Link
                            href={`/admin/payouts?teamId=${team.id}&sponsorAffiliateId=${team.sponsorAffiliateId}`}
                          >
                            <DollarSign className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Add deal rules"
                        >
                          <Link href={`/admin/deal-rules?sponsorId=${team.sponsorAffiliateId}&teamId=${team.id}`}>
                            <GitBranch className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${team.name}`}
                          onClick={() => setDeletingTeam(team)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            aria-label="Close dialog"
            onClick={() => {
              if (!submitting) setCreateOpen(false);
            }}
          />
          <Card className="relative z-10 w-full max-w-lg shadow-lg">
            <CardHeader>
              <CardTitle>Create team</CardTitle>
              <CardDescription>
                The sponsor affiliate will see this team on their dashboard and
                can track recruits assigned via deal rules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={createTeam} className="space-y-4">
                <AffiliateSearchCombobox
                  id="team-sponsor"
                  label="Sponsor affiliate (team manager)"
                  value={sponsor?.id ?? ""}
                  selected={sponsor}
                  onChange={(_id, affiliate) => setSponsor(affiliate)}
                  disabled={submitting}
                />
                <div className="space-y-2">
                  <Label htmlFor="team-name">Team name</Label>
                  <Input
                    id="team-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder="West Coast Team"
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-desc">Description (optional)</Label>
                  <Input
                    id="team-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="Blair, Sarah, and Mike recruits"
                    disabled={submitting}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating…" : "Create team"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingTeam}
        title="Delete team?"
        description={
          deletingTeam
            ? `"${deletingTeam.name}" will be removed. Deal rules on this team become unassigned (teamId cleared). Paid history is kept.`
            : ""
        }
        confirmLabel="Delete team"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setDeletingTeam(null);
        }}
      />
    </div>
  );
}
