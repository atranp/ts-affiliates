"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/PageHeader";
import type { AffiliateOption } from "@/components/admin/AffiliateSearchCombobox";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { DealRuleDialog } from "@/components/admin/deal-rules/DealRuleDialog";
import { DealRuleFields } from "@/components/admin/deal-rules/DealRuleFields";
import { DealRulesTable } from "@/components/admin/deal-rules/DealRulesTable";
import {
  EMPTY_CREATE_DRAFT,
  backfillToastDescription,
  defaultDownlineTeamId,
  draftFromRule,
  draftPayload,
  validateDraft,
  type RuleDraft,
  type TeamOption,
} from "@/components/admin/deal-rules/rule-draft";
import { Button } from "@/components/ui/button";
import {
  useAdminDealRules,
  useAdminQuery,
  type DealRuleListItem,
} from "@/hooks/use-admin-query";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";

type SavedRule = DealRuleListItem & {
  overridesRemoved?: number;
  backfillStarted?: boolean;
};

function useSponsorTeams(sponsorId: string | undefined) {
  return useAdminQuery<{ teams: TeamOption[] }>(
    queryKeys.admin.sponsorTeams(sponsorId ?? ""),
    sponsorId ? `/api/admin/teams?sponsorAffiliateId=${sponsorId}` : null
  );
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
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
  const queryClient = useQueryClient();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    refetch: refetchRules,
  } = useAdminDealRules();

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<RuleDraft>(EMPTY_CREATE_DRAFT);
  const [editingRule, setEditingRule] = useState<DealRuleListItem | null>(null);
  const [editDraft, setEditDraft] = useState<RuleDraft>(EMPTY_CREATE_DRAFT);
  const [deletingRule, setDeletingRule] = useState<DealRuleListItem | null>(null);
  const [urlPrefilled, setUrlPrefilled] = useState(false);

  const { data: createTeamsData } = useSponsorTeams(createDraft.sponsor?.id);
  const { data: editTeamsData } = useSponsorTeams(
    editingRule ? editDraft.sponsor?.id : undefined
  );

  const invalidateRules = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.dealRules });

  const createRule = useMutation({
    mutationFn: (draft: RuleDraft) =>
      apiFetch<SavedRule>("/api/admin/deal-rules", {
        method: "POST",
        body: JSON.stringify({
          ...draftPayload(draft),
          type: "REVENUE_OVERRIDE",
          basis: "ORDER_REVENUE",
        }),
      }),
    onSuccess: (body) => {
      toast.success(`Created: ${body.name}`, {
        description: backfillToastDescription(body.backfillStarted),
      });
      setCreateDraft(EMPTY_CREATE_DRAFT);
      setCreateOpen(false);
      void invalidateRules();
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to create rule")),
  });

  const updateRule = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: RuleDraft }) =>
      apiFetch<SavedRule>(`/api/admin/deal-rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...draftPayload(draft), active: draft.active }),
      }),
    onSuccess: (body) => {
      toast.success(`Updated: ${body.name}`, {
        description: backfillToastDescription(
          body.backfillStarted,
          body.overridesRemoved
            ? `removed ${body.overridesRemoved} pending/unpaid lines`
            : undefined
        ),
      });
      setEditingRule(null);
      void invalidateRules();
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to update rule")),
  });

  const deleteRule = useMutation({
    mutationFn: (rule: DealRuleListItem) =>
      apiFetch<{ overridesRemoved: number }>(
        `/api/admin/deal-rules/${rule.id}`,
        { method: "DELETE" }
      ),
    onSuccess: (body, rule) => {
      toast.success(`Deleted: ${rule.name}`, {
        description:
          body.overridesRemoved > 0
            ? `Removed ${body.overridesRemoved} pending/unpaid team bonus lines. Paid history kept.`
            : undefined,
      });
      setDeletingRule(null);
      void invalidateRules();
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to delete rule")),
  });

  useEffect(() => {
    if (urlPrefilled) return;
    const sponsorId = searchParams.get("sponsorId");
    const teamIdParam = searchParams.get("teamId");
    const shouldOpen = searchParams.get("create") === "1" || teamIdParam;

    if (!sponsorId && !teamIdParam) {
      setUrlPrefilled(true);
      return;
    }

    async function prefillFromUrl() {
      try {
        if (sponsorId) {
          const affiliate = await apiFetch<AffiliateOption>(
            `/api/admin/affiliates/${sponsorId}`
          );
          setCreateDraft((draft) => ({
            ...draft,
            sponsor: {
              id: affiliate.id,
              email: affiliate.email,
              displayName: affiliate.displayName,
              slicewpId: affiliate.slicewpId,
              status: affiliate.status,
            },
          }));
        }
        if (teamIdParam) {
          setCreateDraft((draft) => ({
            ...draft,
            teamId: teamIdParam,
            scope: "team",
          }));
        }
        if (shouldOpen) setCreateOpen(true);
      } catch {
        // A stale link leaves the form closed rather than half-filled.
      } finally {
        setUrlPrefilled(true);
      }
    }

    void prefillFromUrl();
  }, [searchParams, urlPrefilled]);

  const createSponsorId = createDraft.sponsor?.id;
  useEffect(() => {
    if (!createSponsorId || createDraft.scope !== "team" || createDraft.teamId) {
      return;
    }
    const downlineId = defaultDownlineTeamId(createTeamsData?.teams);
    if (downlineId) {
      setCreateDraft((draft) => ({ ...draft, teamId: downlineId }));
    }
  }, [createSponsorId, createDraft.scope, createDraft.teamId, createTeamsData?.teams]);

  function submitDraft(draft: RuleDraft, submit: () => void) {
    const problem = validateDraft(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    submit();
  }

  function openEdit(rule: DealRuleListItem) {
    setEditingRule(rule);
    setEditDraft(draftFromRule(rule));
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

      <div className="ts-table-wrap">
        <div className="ts-table-toolbar">
          <div>
            <h2 className="ts-section-title">Active rules</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rules ? `${rules.length} rule${rules.length === 1 ? "" : "s"}` : "—"}
            </p>
          </div>
        </div>
        <div className="ts-table-body p-4 sm:p-5">
          {rulesLoading && <TableSkeleton columns={7} />}
          {!rulesLoading && rules?.length === 0 && (
            <EmptyState title="No deal rules yet" />
          )}
          {!rulesLoading && rules && rules.length > 0 && (
            <DealRulesTable
              rules={rules}
              onEdit={openEdit}
              onDelete={setDeletingRule}
            />
          )}
        </div>
      </div>

      <DealRuleDialog
        open={createOpen}
        title="Create rule"
        description={
          createRule.isPending
            ? "Saving rule… ledger backfill runs in the background after this closes."
            : undefined
        }
        submitLabel="Create rule"
        submitting={createRule.isPending}
        onSubmit={() =>
          submitDraft(createDraft, () => createRule.mutate(createDraft))
        }
        onClose={() => setCreateOpen(false)}
      >
        <DealRuleFields
          variant="create"
          draft={createDraft}
          onChange={(patch) => setCreateDraft((draft) => ({ ...draft, ...patch }))}
          teams={createTeamsData?.teams}
          disabled={createRule.isPending}
        />
      </DealRuleDialog>

      <DealRuleDialog
        open={!!editingRule}
        title="Edit rule"
        description={
          updateRule.isPending
            ? "Saving… ledger backfill runs in the background after this closes."
            : "Changing sponsor, recruit, rate, or milestone recalculates bonus lines."
        }
        submitLabel="Save changes"
        submitting={updateRule.isPending}
        onSubmit={() => {
          if (!editingRule) return;
          submitDraft(editDraft, () =>
            updateRule.mutate({ id: editingRule.id, draft: editDraft })
          );
        }}
        onClose={() => setEditingRule(null)}
      >
        <DealRuleFields
          variant="edit"
          draft={editDraft}
          onChange={(patch) => setEditDraft((draft) => ({ ...draft, ...patch }))}
          teams={editTeamsData?.teams}
          disabled={updateRule.isPending}
        />
      </DealRuleDialog>

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
        loading={deleteRule.isPending}
        onConfirm={() => deletingRule && deleteRule.mutate(deletingRule)}
        onCancel={() => setDeletingRule(null)}
      />
    </div>
  );
}
