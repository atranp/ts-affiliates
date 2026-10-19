"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataCard,
  DataCardHeader,
  DataCardList,
  DataCardMeta,
  ResponsiveTable,
} from "@/components/ui/data-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DealRuleListItem } from "@/hooks/use-admin-query";

/** The team name is already folded in here, so it needs no column of its own. */
function appliesTo(rule: DealRuleListItem) {
  if (rule.sourceAffiliate) {
    return rule.sourceAffiliate.displayName ?? rule.sourceAffiliate.email;
  }
  return rule.team ? `Entire team · ${rule.team.name}` : "Entire team";
}

function milestoneLabel(rule: DealRuleListItem) {
  if (!rule.milestoneRevenueThreshold) return "—";
  return `$${Number(rule.milestoneRevenueThreshold).toLocaleString("en-US")}`;
}

function sponsorName(rule: DealRuleListItem) {
  return rule.sponsorAffiliate.displayName ?? rule.sponsorAffiliate.email;
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "paid" : "secondary"}>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

/** Shared by the desktop row and the mobile card so they can't drift apart. */
function RuleActions({
  rule,
  onEdit,
  onDelete,
}: {
  rule: DealRuleListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit ${rule.name}`}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${rule.name}`}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </>
  );
}

type DealRulesTableProps = {
  rules: DealRuleListItem[];
  onEdit: (rule: DealRuleListItem) => void;
  onDelete: (rule: DealRuleListItem) => void;
};

export function DealRulesTable({ rules, onEdit, onDelete }: DealRulesTableProps) {
  return (
    <ResponsiveTable
      table={
        <Table>
          <TableHeader>
            <TableRow className="ts-table-header hover:bg-muted">
              <TableHead>Name</TableHead>
              <TableHead>Sponsor</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                Milestone
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[92px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>{sponsorName(rule)}</TableCell>
                <TableCell>{appliesTo(rule)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {rule.ratePercent}%
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-right tabular-nums text-muted-foreground lg:table-cell">
                  {milestoneLabel(rule)}
                </TableCell>
                <TableCell>
                  <ActiveBadge active={rule.active} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-0.5">
                    <RuleActions
                      rule={rule}
                      onEdit={() => onEdit(rule)}
                      onDelete={() => onDelete(rule)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
      cards={
        <DataCardList>
          {rules.map((rule) => (
            <DataCard key={rule.id}>
              <DataCardHeader
                title={rule.name}
                subtitle={appliesTo(rule)}
                value={`${rule.ratePercent}%`}
              />
              <DataCardMeta className="justify-between">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <ActiveBadge active={rule.active} />
                  <span>{sponsorName(rule)}</span>
                  {rule.milestoneRevenueThreshold && (
                    <span>Milestone {milestoneLabel(rule)}</span>
                  )}
                </span>
                <span className="flex items-center gap-0.5">
                  <RuleActions
                    rule={rule}
                    onEdit={() => onEdit(rule)}
                    onDelete={() => onDelete(rule)}
                  />
                </span>
              </DataCardMeta>
            </DataCard>
          ))}
        </DataCardList>
      }
    />
  );
}
