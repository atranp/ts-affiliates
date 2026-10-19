import type { AffiliateOption } from "@/components/admin/AffiliateSearchCombobox";
import type { DealRuleListItem } from "@/hooks/use-admin-query";
import { SLICEWP_DOWNLINE_KEY } from "@/lib/teams/constants";

export type RuleScope = "team" | "recruit";

export type TeamOption = {
  id: string;
  name: string;
  slicewpKey?: string | null;
};

/** Everything the create and edit dialogs collect, before it becomes a request body. */
export type RuleDraft = {
  name: string;
  ratePercent: string;
  milestoneRevenueThreshold: string;
  teamId: string;
  scope: RuleScope;
  active: boolean;
  sponsor: AffiliateOption | null;
  recruit: AffiliateOption | null;
};

export const EMPTY_CREATE_DRAFT: RuleDraft = {
  name: "",
  ratePercent: "10",
  milestoneRevenueThreshold: "10000",
  teamId: "",
  scope: "team",
  active: true,
  sponsor: null,
  recruit: null,
};

export function defaultDownlineTeamId(teams: TeamOption[] | undefined) {
  return (
    teams?.find((team) => team.slicewpKey === SLICEWP_DOWNLINE_KEY)?.id ?? ""
  );
}

function affiliateFromRule(affiliate: {
  id: string;
  email: string;
  displayName: string | null;
}): AffiliateOption {
  return {
    id: affiliate.id,
    email: affiliate.email,
    displayName: affiliate.displayName,
    slicewpId: 0,
    status: "ACTIVE",
  };
}

export function draftFromRule(rule: DealRuleListItem): RuleDraft {
  return {
    name: rule.name,
    ratePercent: rule.ratePercent,
    milestoneRevenueThreshold: rule.milestoneRevenueThreshold ?? "",
    active: rule.active,
    teamId: rule.teamId ?? "",
    scope: rule.sourceAffiliate ? "recruit" : "team",
    sponsor: affiliateFromRule(rule.sponsorAffiliate),
    recruit: rule.sourceAffiliate ? affiliateFromRule(rule.sourceAffiliate) : null,
  };
}

/** Returns the message to show, or null when the draft can be submitted. */
export function validateDraft(draft: RuleDraft): string | null {
  if (!draft.sponsor?.id) return "Select a sponsor";
  if (draft.scope === "recruit" && !draft.recruit?.id) {
    return "Select a recruit for recruit-specific rules";
  }
  if (draft.scope === "team" && !draft.teamId) {
    return "Select a team for team-wide rules";
  }
  if (draft.scope === "recruit" && draft.sponsor.id === draft.recruit?.id) {
    return "Sponsor and recruit must be different affiliates";
  }
  return null;
}

/** Fields shared by the create (POST) and edit (PATCH) request bodies. */
export function draftPayload(draft: RuleDraft) {
  return {
    name: draft.name,
    sponsorAffiliateId: draft.sponsor?.id,
    sourceAffiliateId:
      draft.scope === "recruit" ? draft.recruit?.id ?? null : null,
    ratePercent: Number(draft.ratePercent),
    milestoneRevenueThreshold: draft.milestoneRevenueThreshold
      ? Number(draft.milestoneRevenueThreshold)
      : null,
    teamId: draft.teamId || null,
  };
}

export function backfillToastDescription(
  backfillStarted?: boolean,
  extra?: string
) {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (backfillStarted) {
    parts.push(
      "Ledger backfill running in background — entries appear within a minute"
    );
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
