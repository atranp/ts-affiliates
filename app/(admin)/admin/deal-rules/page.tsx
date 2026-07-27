"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  AffiliateSearchCombobox,
  type AffiliateOption,
} from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { EmptyState } from "@/components/admin/EmptyState";
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
import {
  adminMutate,
  useAdminDealRules,
  useAdminQuery,
  type DealRuleListItem,
} from "@/hooks/use-admin-query";
import { apiFetch } from "@/lib/api-client";
import { SLICEWP_DOWNLINE_KEY } from "@/lib/teams/constants";

type RuleScope = "team" | "recruit";

type TeamOption = {
  id: string;
  name: string;
  slicewpKey?: string | null;
};

function defaultDownlineTeamId(teams: TeamOption[] | undefined) {
  return teams?.find((team) => team.slicewpKey === SLICEWP_DOWNLINE_KEY)?.id ?? "";
}

function backfillToastDescription(backfillStarted?: boolean, extra?: string) {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (backfillStarted) {
    parts.push(
      "Ledger backfill running in background — entries appear within a minute"
    );
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function affiliateFromRule(
  affiliate: { id: string; email: string; displayName: string | null }
): AffiliateOption {
  return {
    id: affiliate.id,
    email: affiliate.email,
    displayName: affiliate.displayName,
    slicewpId: 0,
    status: "ACTIVE",
  };
}

export default function AdminDealRulesPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-6">Loading deal rules...</p>}>
      <AdminDealRulesPageContent />
    </Suspense>
  );
}

function AdminDealRulesPageContent() {
  const searchParams = useSearchParams();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    refetch: refetchRules,
  } = useAdminDealRules();
  const [submitting, setSubmitting] = useState(false);
  const [sponsor, setSponsor] = useState<AffiliateOption | null>(null);
  const [recruit, setRecruit] = useState<AffiliateOption | null>(null);
  const [form, setForm] = useState({
    name: "",
    ratePercent: "10",
    milestoneRevenueThreshold: "10000",
    teamId: "",
    scope: "team" as RuleScope,
  });
  const [editingRule, setEditingRule] = useState<DealRuleListItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    ratePercent: "",
    milestoneRevenueThreshold: "",
    active: true,
    teamId: "",
    scope: "recruit" as RuleScope,
  });
  const [editSponsor, setEditSponsor] = useState<AffiliateOption | null>(null);
  const [editRecruit, setEditRecruit] = useState<AffiliateOption | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingRule, setDeletingRule] = useState<DealRuleListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [urlPrefilled, setUrlPrefilled] = useState(false);

  useEffect(() => {
    if (urlPrefilled) return;
    const sponsorId = searchParams.get("sponsorId");
    const teamIdParam = searchParams.get("teamId");
    const shouldOpen = searchParams.get("create") === "1" || teamIdParam;

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
        if (teamIdParam) {
          setForm((f) => ({ ...f, teamId: teamIdParam, scope: "team" }));
        }
        if (shouldOpen) setCreateOpen(true);
      } catch {
        // ignore
      } finally {
        setUrlPrefilled(true);
      }
    }

    if (sponsorId || teamIdParam) prefillFromUrl();
    else setUrlPrefilled(true);
  }, [searchParams, urlPrefilled]);

  const createTeamsUrl = sponsor?.id
    ? `/api/admin/teams?sponsorAffiliateId=${sponsor.id}`
    : null;
  const editTeamsUrl = editSponsor?.id
    ? `/api/admin/teams?sponsorAffiliateId=${editSponsor.id}`
    : null;

  const { data: createTeamsData } = useAdminQuery<{ teams: TeamOption[] }>(
    ["admin", "teams", sponsor?.id ?? ""],
    createTeamsUrl
  );
  const { data: editTeamsData } = useAdminQuery<{ teams: TeamOption[] }>(
    ["admin", "teams", editSponsor?.id ?? ""],
    editTeamsUrl
  );

  useEffect(() => {
    if (!sponsor?.id || form.scope !== "team" || form.teamId) return;
    const downlineId = defaultDownlineTeamId(createTeamsData?.teams);
    if (downlineId) {
      setForm((current) => ({ ...current, teamId: downlineId }));
    }
  }, [sponsor?.id, form.scope, form.teamId, createTeamsData?.teams]);

  function openEdit(rule: DealRuleListItem) {
    setEditingRule(rule);
    const scope: RuleScope = rule.sourceAffiliate ? "recruit" : "team";
    setEditForm({
      name: rule.name,
      ratePercent: rule.ratePercent,
      milestoneRevenueThreshold: rule.milestoneRevenueThreshold ?? "",
      active: rule.active,
      teamId: rule.teamId ?? "",
      scope,
    });
    setEditSponsor(affiliateFromRule(rule.sponsorAffiliate));
    setEditRecruit(
      rule.sourceAffiliate ? affiliateFromRule(rule.sourceAffiliate) : null
    );
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditingRule(null);
    setEditSponsor(null);
    setEditRecruit(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRule) return;

    if (!editSponsor?.id) {
      toast.error("Select a sponsor");
      return;
    }

    if (editForm.scope === "recruit" && !editRecruit?.id) {
      toast.error("Select a recruit for recruit-specific rules");
      return;
    }

    if (editForm.scope === "team" && !editForm.teamId) {
      toast.error("Select a team for team-wide rules");
      return;
    }

    if (
      editForm.scope === "recruit" &&
      editSponsor.id === editRecruit?.id
    ) {
      toast.error("Sponsor and recruit must be different affiliates");
      return;
    }

    setSavingEdit(true);
    try {
      const body = await adminMutate<
        DealRuleListItem & {
          overridesRemoved?: number;
          backfillStarted?: boolean;
        }
      >(`/api/admin/deal-rules/${editingRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          sponsorAffiliateId: editSponsor.id,
          sourceAffiliateId:
            editForm.scope === "recruit" ? editRecruit?.id ?? null : null,
          ratePercent: Number(editForm.ratePercent),
          milestoneRevenueThreshold: editForm.milestoneRevenueThreshold
            ? Number(editForm.milestoneRevenueThreshold)
            : null,
          active: editForm.active,
          teamId: editForm.teamId || null,
        }),
      });

      const parts: string[] = [];
      if (body.overridesRemoved) {
        parts.push(`removed ${body.overridesRemoved} pending/unpaid lines`);
      }

      toast.success(`Updated: ${body.name}`, {
        description: backfillToastDescription(
          body.backfillStarted,
          parts.length > 0 ? parts.join(" · ") : undefined
        ),
      });
      closeEdit();
      void refetchRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update rule");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deletingRule) return;

    setDeleting(true);
    try {
      const body = await adminMutate<{ overridesRemoved: number }>(
        `/api/admin/deal-rules/${deletingRule.id}`,
        { method: "DELETE" }
      );
      toast.success(`Deleted: ${deletingRule.name}`, {
        description:
          body.overridesRemoved > 0
            ? `Removed ${body.overridesRemoved} pending/unpaid team bonus lines. Paid history kept.`
            : undefined,
      });
      setDeletingRule(null);
      void refetchRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    } finally {
      setDeleting(false);
    }
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();

    if (!sponsor?.id) {
      toast.error("Select a sponsor");
      return;
    }

    if (form.scope === "recruit" && !recruit?.id) {
      toast.error("Select a recruit for recruit-specific rules");
      return;
    }

    if (form.scope === "team" && !form.teamId) {
      toast.error("Select a team for team-wide rules");
      return;
    }

    if (form.scope === "recruit" && sponsor.id === recruit?.id) {
      toast.error("Sponsor and recruit must be different affiliates");
      return;
    }

    setSubmitting(true);
    try {
      const body = await adminMutate<
        DealRuleListItem & { backfillStarted?: boolean }
      >(
        "/api/admin/deal-rules",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            type: "REVENUE_OVERRIDE",
            sponsorAffiliateId: sponsor.id,
            sourceAffiliateId:
              form.scope === "recruit" ? recruit?.id ?? null : null,
            ratePercent: Number(form.ratePercent),
            basis: "ORDER_REVENUE",
            milestoneRevenueThreshold: form.milestoneRevenueThreshold
              ? Number(form.milestoneRevenueThreshold)
              : null,
            teamId: form.teamId || null,
          }),
        }
      );
      toast.success(`Created: ${body.name}`, {
        description: backfillToastDescription(body.backfillStarted),
      });
      setForm({
        name: "",
        ratePercent: "10",
        milestoneRevenueThreshold: "10000",
        teamId: "",
        scope: "team",
      });
      setSponsor(null);
      setRecruit(null);
      setCreateOpen(false);
      void refetchRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deal Rules"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create rule
          </Button>
        }
      />

      {rulesError && (
        <ErrorState message={rulesError.message} onRetry={() => refetchRules()} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active rules</CardTitle>
          <CardDescription>
            {rules ? `${rules.length} rule${rules.length === 1 ? "" : "s"}` : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rulesLoading && <TableSkeleton columns={7} />}
          {!rulesLoading && rules?.length === 0 && (
            <EmptyState title="No deal rules yet" />
          )}
          {!rulesLoading && rules && rules.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      {rule.sponsorAffiliate.displayName ??
                        rule.sponsorAffiliate.email}
                    </TableCell>
                    <TableCell>
                      {rule.sourceAffiliate?.displayName ??
                        rule.sourceAffiliate?.email ??
                        (rule.team ? `Entire team · ${rule.team.name}` : "Entire team")}
                    </TableCell>
                    <TableCell>
                      {rule.team?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{rule.ratePercent}%</TableCell>
                    <TableCell>
                      {rule.milestoneRevenueThreshold
                        ? `$${Number(rule.milestoneRevenueThreshold).toLocaleString()} revenue`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.active ? "paid" : "secondary"}>
                        {rule.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${rule.name}`}
                          onClick={() => openEdit(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${rule.name}`}
                          onClick={() => setDeletingRule(rule)}
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
          <Card className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <CardHeader>
              <CardTitle>Create rule</CardTitle>
              {submitting && (
                <CardDescription>
                  Saving rule… ledger backfill runs in the background after this
                  closes.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={createRule} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Rule name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Trin 10% of Blair revenue"
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Scope</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="create-scope"
                        checked={form.scope === "team"}
                        onChange={() => {
                          setRecruit(null);
                          setForm((current) => ({
                            ...current,
                            scope: "team",
                            teamId: defaultDownlineTeamId(createTeamsData?.teams),
                          }));
                        }}
                        disabled={submitting}
                      />
                      Entire team
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="create-scope"
                        checked={form.scope === "recruit"}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            scope: "recruit",
                            teamId: "",
                          }))
                        }
                        disabled={submitting}
                      />
                      Single recruit
                    </label>
                  </div>
                </div>
                <AffiliateSearchCombobox
                  id="sponsor"
                  label="Sponsor"
                  value={sponsor?.id ?? ""}
                  selected={sponsor}
                  onChange={(_id, affiliate) => {
                    setSponsor(affiliate);
                    setForm((f) => ({
                      ...f,
                      teamId:
                        f.scope === "team"
                          ? ""
                          : f.teamId,
                    }));
                  }}
                  excludeId={recruit?.id}
                  disabled={submitting}
                />
                {form.scope === "recruit" ? (
                  <AffiliateSearchCombobox
                    id="source"
                    label="Recruit"
                    value={recruit?.id ?? ""}
                    selected={recruit}
                    onChange={(_id, affiliate) => setRecruit(affiliate)}
                    excludeId={sponsor?.id}
                    disabled={submitting}
                  />
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="create-team">Team</Label>
                    <select
                      id="create-team"
                      className="select-field w-full"
                      value={form.teamId}
                      disabled={!sponsor?.id || submitting}
                      onChange={(e) =>
                        setForm({ ...form, teamId: e.target.value })
                      }
                    >
                      <option value="">Select team</option>
                      {createTeamsData?.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {form.scope === "recruit" && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="create-team-optional">Team (optional)</Label>
                    <select
                      id="create-team-optional"
                      className="select-field w-full"
                      value={form.teamId}
                      disabled={!sponsor?.id || submitting}
                      onChange={(e) =>
                        setForm({ ...form, teamId: e.target.value })
                      }
                    >
                      <option value="">No team — unassigned</option>
                      {createTeamsData?.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="rate">Rate (%)</Label>
                  <Input
                    id="rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.ratePercent}
                    onChange={(e) =>
                      setForm({ ...form, ratePercent: e.target.value })
                    }
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="milestone">Milestone (optional)</Label>
                  <Input
                    id="milestone"
                    type="number"
                    min="0"
                    step="1"
                    value={form.milestoneRevenueThreshold}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        milestoneRevenueThreshold: e.target.value,
                      })
                    }
                    placeholder="10000"
                    disabled={submitting}
                  />
                </div>
                <div className="flex justify-end gap-2 md:col-span-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : "Create rule"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {editingRule && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            aria-label="Close edit dialog"
            onClick={closeEdit}
          />
          <Card className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <CardHeader>
              <CardTitle>Edit rule</CardTitle>
              <CardDescription>
                {savingEdit
                  ? "Saving… ledger backfill runs in the background after this closes."
                  : "Changing sponsor, recruit, rate, or milestone recalculates bonus lines."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveEdit} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="edit-name">Rule name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    required
                    disabled={savingEdit}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Scope</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="edit-scope"
                        checked={editForm.scope === "team"}
                        onChange={() => {
                          setEditRecruit(null);
                          setEditForm((current) => ({
                            ...current,
                            scope: "team",
                            teamId:
                              current.teamId ||
                              defaultDownlineTeamId(editTeamsData?.teams),
                          }));
                        }}
                        disabled={savingEdit}
                      />
                      Entire team
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="edit-scope"
                        checked={editForm.scope === "recruit"}
                        onChange={() =>
                          setEditForm((current) => ({ ...current, scope: "recruit" }))
                        }
                        disabled={savingEdit}
                      />
                      Single recruit
                    </label>
                  </div>
                </div>
                <AffiliateSearchCombobox
                  id="edit-sponsor"
                  label="Sponsor"
                  value={editSponsor?.id ?? ""}
                  selected={editSponsor}
                  onChange={(_id, affiliate) => {
                    setEditSponsor(affiliate);
                    setEditForm((f) => ({
                      ...f,
                      teamId:
                        f.scope === "team"
                          ? ""
                          : f.teamId,
                    }));
                  }}
                  excludeId={editRecruit?.id}
                  disabled={savingEdit}
                />
                {editForm.scope === "recruit" ? (
                  <AffiliateSearchCombobox
                    id="edit-recruit"
                    label="Recruit"
                    value={editRecruit?.id ?? ""}
                    selected={editRecruit}
                    onChange={(_id, affiliate) => setEditRecruit(affiliate)}
                    excludeId={editSponsor?.id}
                    disabled={savingEdit}
                  />
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="edit-team">Team</Label>
                    <select
                      id="edit-team"
                      className="select-field w-full"
                      value={editForm.teamId}
                      disabled={!editSponsor?.id || savingEdit}
                      onChange={(e) =>
                        setEditForm({ ...editForm, teamId: e.target.value })
                      }
                    >
                      <option value="">Select team</option>
                      {editTeamsData?.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {editForm.scope === "recruit" && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="edit-team-optional">Team (optional)</Label>
                    <select
                      id="edit-team-optional"
                      className="select-field w-full"
                      value={editForm.teamId}
                      disabled={!editSponsor?.id || savingEdit}
                      onChange={(e) =>
                        setEditForm({ ...editForm, teamId: e.target.value })
                      }
                    >
                      <option value="">No team — unassigned</option>
                      {editTeamsData?.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="edit-rate">Rate (%)</Label>
                  <Input
                    id="edit-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.ratePercent}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ratePercent: e.target.value })
                    }
                    required
                    disabled={savingEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-milestone">Milestone</Label>
                  <Input
                    id="edit-milestone"
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.milestoneRevenueThreshold}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        milestoneRevenueThreshold: e.target.value,
                      })
                    }
                    placeholder="Optional"
                    disabled={savingEdit}
                  />
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <input
                    id="edit-active"
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(e) =>
                      setEditForm({ ...editForm, active: e.target.checked })
                    }
                    disabled={savingEdit}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="edit-active">Active</Label>
                </div>
                <div className="flex justify-end gap-2 md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeEdit}
                    disabled={savingEdit}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingEdit}>
                    {savingEdit ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingRule}
        title="Delete deal rule?"
        description={
          deletingRule
            ? `"${deletingRule.name}" will be removed. Pending and unpaid team bonus lines for this rule are deleted. Paid entries stay in the ledger for history.`
            : ""
        }
        confirmLabel="Delete rule"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setDeletingRule(null);
        }}
      />
    </div>
  );
}
