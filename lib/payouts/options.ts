import { CommissionStatus, DealBasis, LedgerEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, toNumber } from "@/lib/utils";
import {
  listDirectPayoutAnchorsForMember,
  coveredSourceCommissionIds,
} from "@/lib/payouts/direct-payout-ref";
import { payoutTargetKey, type PayoutTarget } from "./create";

/**
 * Everything an ambassador could be paid for right now, priced in a single
 * pass. Amounts live on the options themselves so a target is never picked
 * against a stale figure and then re-priced in the review step.
 */

export type PayoutOption = {
  key: string;
  target: PayoutTarget;
  label: string;
  sublabel: string;
  /** How the amount was arrived at, e.g. "10% of each sale · $19,749.73 in sales". */
  math: string | null;
  amount: number;
  entryCount: number;
  revenue: number;
};

/**
 * A team is a heading, not a button. Members are paid one at a time so each
 * receipt lines up with that member's own sales report.
 */
export type PayoutTeamGroup = {
  teamId: string;
  label: string;
  sublabel: string;
  /** Sum of the members below, which is the part that can actually be paid. */
  amount: number;
  entryCount: number;
  revenue: number;
  members: PayoutOption[];
};

export type PayoutOptions = {
  affiliateId: string;
  affiliateName: string;
  /** Shared by every option so the review step can price against the same instant. */
  cutoff: string;
  direct: PayoutOption | null;
  teams: PayoutTeamGroup[];
  /**
   * Unpaid money no option covers: overrides with no team or no member
   * attached, plus bonuses and adjustments. Nothing here can be paid from this
   * screen, so it is reported rather than silently omitted from the totals.
   */
  unattributed: { amount: number; entryCount: number };
  /**
   * Team earnings on sales not yet included in any paid direct payout for the
   * recruit — wait for their direct receipt before paying the sponsor.
   */
  awaitingDirectPayout: { amount: number; entryCount: number };
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function trimRate(percent: number) {
  return `${percent.toFixed(2).replace(/\.?0+$/, "")}%`;
}

type Totals = {
  amount: number;
  entryCount: number;
  revenue: number;
  terms: Set<string>;
};

function emptyTotals(): Totals {
  return { amount: 0, entryCount: 0, revenue: 0, terms: new Set<string>() };
}

function addTo(
  totals: Totals,
  amount: number,
  revenue: number,
  term: string | null
) {
  totals.amount += amount;
  totals.entryCount += 1;
  totals.revenue += revenue;
  if (term) totals.terms.add(term);
}

/**
 * Explains the amount rather than restating it. Rates are applied per sale and
 * each result is stored rounded to cents, so the rule rate is described as a
 * per-sale rate instead of implying the total is an exact multiple.
 */
function describeMath(totals: Totals): string | null {
  if (totals.entryCount === 0) return null;

  if (totals.terms.size === 1) {
    const [percentRaw, basis] = Array.from(totals.terms)[0].split("|");
    const percent = Number(percentRaw);

    if (basis === DealBasis.FIXED) {
      return `${formatCurrency(percent)} per sale × ${totals.entryCount.toLocaleString("en-US")}`;
    }
    if (basis === DealBasis.ORDER_REVENUE && totals.revenue > 0) {
      return `${formatCurrency(totals.revenue)} in sales × ${trimRate(percent)} each`;
    }
    if (basis === DealBasis.RECRUIT_COMMISSION) {
      return `${trimRate(percent)} of their commission on ${formatCurrency(totals.revenue)} in sales`;
    }
  }

  if (totals.revenue <= 0) return null;

  // Mixed terms, or direct commissions where the rate comes from SliceWP and
  // varies per order — an average is the only honest summary.
  return `${formatCurrency(totals.revenue)} in sales × ~${trimRate((totals.amount / totals.revenue) * 100)} avg`;
}

type OverrideRow = {
  amount: number;
  revenue: number;
  term: string | null;
  sourceCommissionId: string | null;
  teamId: string;
  teamName: string;
  memberId: string;
  memberName: string;
};

async function buildMemberPayoutOptions(
  rows: OverrideRow[]
): Promise<PayoutOption[]> {
  if (rows.length === 0) return [];

  const memberId = rows[0].memberId;
  const teamId = rows[0].teamId;
  const memberName = rows[0].memberName;
  const anchors = await listDirectPayoutAnchorsForMember(memberId);
  const options: PayoutOption[] = [];

  for (const anchor of anchors) {
    const commissionIdSet = new Set(anchor.commissionIds);
    const bucket = emptyTotals();

    for (const row of rows) {
      if (!row.sourceCommissionId || !commissionIdSet.has(row.sourceCommissionId)) {
        continue;
      }
      addTo(bucket, row.amount, row.revenue, row.term);
    }

    if (bucket.entryCount === 0) continue;

    const directPayout =
      anchor.source === "slicewp"
        ? ({ source: "slicewp", paymentId: anchor.paymentId } as const)
        : ({ source: "platform", batchId: anchor.batchId } as const);

    const target: PayoutTarget = {
      scope: "member",
      teamId,
      memberId,
      directPayout,
    };

    options.push({
      key: payoutTargetKey(target),
      target,
      label: memberName,
      sublabel: `${anchor.label} · ${plural(bucket.entryCount, "sale")}`,
      math: describeMath(bucket),
      amount: bucket.amount,
      entryCount: bucket.entryCount,
      revenue: bucket.revenue,
    });
  }

  return options;
}

export async function getPayoutOptions(input: {
  affiliateId: string;
  cutoff: Date;
}): Promise<PayoutOptions> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: input.affiliateId },
    select: { displayName: true, email: true },
  });
  if (!affiliate) {
    throw new Error("Affiliate not found.");
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      affiliateId: input.affiliateId,
      status: CommissionStatus.UNPAID,
      occurredAt: { lte: input.cutoff },
    },
    select: {
      type: true,
      amount: true,
      orderRevenue: true,
      sourceCommissionId: true,
      sourceAffiliate: { select: { id: true, displayName: true, email: true } },
      dealRule: {
        select: {
          ratePercent: true,
          basis: true,
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  const direct = emptyTotals();
  const overrideRows: OverrideRow[] = [];
  const unattributed = emptyTotals();
  const awaitingDirectPayout = emptyTotals();

  for (const entry of entries) {
    const amount = toNumber(entry.amount);
    const revenue = toNumber(entry.orderRevenue);
    const term = entry.dealRule
      ? `${toNumber(entry.dealRule.ratePercent)}|${entry.dealRule.basis}`
      : null;

    if (entry.type === LedgerEntryType.DIRECT) {
      addTo(direct, amount, revenue, term);
      continue;
    }

    const team =
      entry.type === LedgerEntryType.OVERRIDE ? entry.dealRule?.team : null;
    const member = entry.sourceAffiliate;

    if (!team || !member) {
      addTo(unattributed, amount, revenue, term);
      continue;
    }

    overrideRows.push({
      amount,
      revenue,
      term,
      sourceCommissionId: entry.sourceCommissionId,
      teamId: team.id,
      teamName: team.name,
      memberId: member.id,
      memberName: member.displayName ?? member.email,
    });
  }

  const coveredByMember = new Map<string, Set<string>>();
  const memberIds = Array.from(new Set(overrideRows.map((row) => row.memberId)));
  await Promise.all(
    memberIds.map(async (memberId) => {
      coveredByMember.set(memberId, await coveredSourceCommissionIds(memberId));
    })
  );

  const payableRows: OverrideRow[] = [];
  for (const row of overrideRows) {
    const covered = coveredByMember.get(row.memberId) ?? new Set<string>();
    if (!row.sourceCommissionId || !covered.has(row.sourceCommissionId)) {
      addTo(awaitingDirectPayout, row.amount, row.revenue, row.term);
      continue;
    }
    payableRows.push(row);
  }

  const rowsByMemberTeam = new Map<string, OverrideRow[]>();
  for (const row of payableRows) {
    const key = `${row.teamId}:${row.memberId}`;
    const list = rowsByMemberTeam.get(key) ?? [];
    list.push(row);
    rowsByMemberTeam.set(key, list);
  }

  const teamNames = new Map<string, string>();
  for (const row of payableRows) {
    teamNames.set(row.teamId, row.teamName);
  }

  const directOption: PayoutOption | null =
    direct.entryCount > 0
      ? {
          key: payoutTargetKey({ scope: "direct" }),
          target: { scope: "direct" },
          label: "Direct sales",
          sublabel: `Their own commissions · ${plural(direct.entryCount, "sale")}`,
          math: describeMath(direct),
          amount: direct.amount,
          entryCount: direct.entryCount,
          revenue: direct.revenue,
        }
      : null;

  const teams: PayoutTeamGroup[] = await Promise.all(
    Array.from(teamNames.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(async ([teamId, name]) => {
        const memberKeys = Array.from(rowsByMemberTeam.keys()).filter((key) =>
          key.startsWith(`${teamId}:`)
        );

        const teamMemberOptions = (
          await Promise.all(
            memberKeys.map((key) =>
              buildMemberPayoutOptions(rowsByMemberTeam.get(key)!)
            )
          )
        ).flat();

        teamMemberOptions.sort((a, b) => a.label.localeCompare(b.label));

        return {
          teamId,
          label: name,
          sublabel: `${plural(teamMemberOptions.length, "payout")} to record`,
          amount: teamMemberOptions.reduce((sum, member) => sum + member.amount, 0),
          entryCount: teamMemberOptions.reduce(
            (sum, member) => sum + member.entryCount,
            0
          ),
          revenue: teamMemberOptions.reduce(
            (sum, member) => sum + member.revenue,
            0
          ),
          members: teamMemberOptions,
        };
      })
  );

  const teamsWithOptions = teams.filter((team) => team.members.length > 0);

  return {
    affiliateId: input.affiliateId,
    affiliateName: affiliate.displayName ?? affiliate.email,
    cutoff: input.cutoff.toISOString(),
    direct: directOption,
    teams: teamsWithOptions,
    unattributed,
    awaitingDirectPayout,
  };
}
