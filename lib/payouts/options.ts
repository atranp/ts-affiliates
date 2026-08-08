import { CommissionStatus, DealBasis, LedgerEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, toNumber } from "@/lib/utils";
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
  /** `${ratePercent}|${basis}` per contributing deal rule, to spot mixed terms. */
  terms: Set<string>;
};

type Bucket = Totals & { name: string };

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
  const teamNames = new Map<string, string>();
  const members = new Map<
    string,
    Bucket & { teamId: string; memberId: string }
  >();
  const unattributed = emptyTotals();

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

    // Overrides missing a team or a member cannot be paid individually, and
    // neither can bonuses or adjustments. They fall to the catch-all.
    if (!team || !member) {
      addTo(unattributed, amount, revenue, term);
      continue;
    }

    teamNames.set(team.id, team.name);

    const memberKey = `${team.id}:${member.id}`;
    const bucket = members.get(memberKey) ?? {
      ...emptyTotals(),
      name: member.displayName ?? member.email,
      teamId: team.id,
      memberId: member.id,
    };
    addTo(bucket, amount, revenue, term);
    members.set(memberKey, bucket);
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

  const teams: PayoutTeamGroup[] = Array.from(teamNames.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([teamId, name]) => {
      const teamMembers = Array.from(members.values())
        .filter((member) => member.teamId === teamId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((member): PayoutOption => {
          const target: PayoutTarget = {
            scope: "member",
            teamId,
            memberId: member.memberId,
          };
          return {
            key: payoutTargetKey(target),
            target,
            label: member.name,
            sublabel: plural(member.entryCount, "sale"),
            math: describeMath(member),
            amount: member.amount,
            entryCount: member.entryCount,
            revenue: member.revenue,
          };
        });

      return {
        teamId,
        label: name,
        sublabel: `${plural(teamMembers.length, "member")} to pay`,
        amount: teamMembers.reduce((sum, member) => sum + member.amount, 0),
        entryCount: teamMembers.reduce(
          (sum, member) => sum + member.entryCount,
          0
        ),
        revenue: teamMembers.reduce((sum, member) => sum + member.revenue, 0),
        members: teamMembers,
      };
    });

  return {
    affiliateId: input.affiliateId,
    affiliateName: affiliate.displayName ?? affiliate.email,
    cutoff: input.cutoff.toISOString(),
    direct: directOption,
    teams,
    unattributed,
  };
}
