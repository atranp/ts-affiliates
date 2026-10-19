"use client";

import { AffiliateSearchCombobox } from "@/components/admin/AffiliateSearchCombobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultDownlineTeamId,
  type RuleDraft,
  type RuleScope,
  type TeamOption,
} from "./rule-draft";

type DealRuleFieldsProps = {
  /**
   * Edit keeps the rule's existing team when the scope flips and exposes the
   * Active toggle; create starts each scope from a clean team choice.
   */
  variant: "create" | "edit";
  draft: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
  teams: TeamOption[] | undefined;
  disabled: boolean;
};

export function DealRuleFields({
  variant,
  draft,
  onChange,
  teams,
  disabled,
}: DealRuleFieldsProps) {
  const idPrefix = `${variant}-rule`;
  const isEdit = variant === "edit";

  function changeScope(scope: RuleScope) {
    if (scope === "team") {
      onChange({
        scope,
        recruit: null,
        teamId: isEdit
          ? draft.teamId || defaultDownlineTeamId(teams)
          : defaultDownlineTeamId(teams),
      });
      return;
    }
    onChange({ scope, ...(isEdit ? {} : { teamId: "" }) });
  }

  const teamOptions = teams?.map((team) => (
    <option key={team.id} value={team.id}>
      {team.name}
    </option>
  ));

  return (
    <>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>Rule name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={isEdit ? undefined : "Trin 10% of Blair revenue"}
          required
          disabled={disabled}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Scope</Label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${idPrefix}-scope`}
              checked={draft.scope === "team"}
              onChange={() => changeScope("team")}
              disabled={disabled}
            />
            Entire team
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${idPrefix}-scope`}
              checked={draft.scope === "recruit"}
              onChange={() => changeScope("recruit")}
              disabled={disabled}
            />
            Single recruit
          </label>
        </div>
      </div>
      <AffiliateSearchCombobox
        id={`${idPrefix}-sponsor`}
        label="Sponsor"
        value={draft.sponsor?.id ?? ""}
        selected={draft.sponsor}
        onChange={(_id, affiliate) =>
          onChange({
            sponsor: affiliate,
            ...(draft.scope === "team" ? { teamId: "" } : {}),
          })
        }
        excludeId={draft.recruit?.id}
        disabled={disabled}
      />
      {draft.scope === "recruit" ? (
        <AffiliateSearchCombobox
          id={`${idPrefix}-recruit`}
          label="Recruit"
          value={draft.recruit?.id ?? ""}
          selected={draft.recruit}
          onChange={(_id, affiliate) => onChange({ recruit: affiliate })}
          excludeId={draft.sponsor?.id}
          disabled={disabled}
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-team`}>Team</Label>
          <select
            id={`${idPrefix}-team`}
            className="select-field w-full"
            value={draft.teamId}
            disabled={!draft.sponsor?.id || disabled}
            onChange={(e) => onChange({ teamId: e.target.value })}
          >
            <option value="">Select team</option>
            {teamOptions}
          </select>
        </div>
      )}
      {draft.scope === "recruit" && (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${idPrefix}-team-optional`}>Team (optional)</Label>
          <select
            id={`${idPrefix}-team-optional`}
            className="select-field w-full"
            value={draft.teamId}
            disabled={!draft.sponsor?.id || disabled}
            onChange={(e) => onChange({ teamId: e.target.value })}
          >
            <option value="">No team — unassigned</option>
            {teamOptions}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-rate`}>Rate (%)</Label>
        <Input
          id={`${idPrefix}-rate`}
          type="number"
          min="0"
          step="0.01"
          value={draft.ratePercent}
          onChange={(e) => onChange({ ratePercent: e.target.value })}
          required
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-milestone`}>
          {isEdit ? "Milestone" : "Milestone (optional)"}
        </Label>
        <Input
          id={`${idPrefix}-milestone`}
          type="number"
          min="0"
          step="1"
          value={draft.milestoneRevenueThreshold}
          onChange={(e) =>
            onChange({ milestoneRevenueThreshold: e.target.value })
          }
          placeholder={isEdit ? "Optional" : "10000"}
          disabled={disabled}
        />
      </div>
      {isEdit && (
        <div className="flex items-center gap-2 md:col-span-2">
          <input
            id={`${idPrefix}-active`}
            type="checkbox"
            checked={draft.active}
            onChange={(e) => onChange({ active: e.target.checked })}
            disabled={disabled}
            className="h-4 w-4 rounded border-border"
          />
          <Label htmlFor={`${idPrefix}-active`}>Active</Label>
        </div>
      )}
    </>
  );
}
