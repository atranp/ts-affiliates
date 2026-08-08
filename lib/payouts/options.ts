import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
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
  amount: number;
  entryCount: number;
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

type Bucket = { amount: number; entryCount: number; name: string };

function addTo(bucket: { amount: number; entryCount: number }, amount: number) {
  bucket.amount += amount;
  bucket.entryCount += 1;
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
      sourceAffiliate: { select: { id: true, displayName: true, email: true } },
      dealRule: { select: { team: { select: { id: true, name: true } } } },
    },
  });

  const direct = { amount: 0, entryCount: 0 };
  const teamNames = new Map<string, string>();
  const members = new Map<
    string,
    Bucket & { teamId: string; memberId: string }
  >();
  const unattributed = { amount: 0, entryCount: 0 };

  for (const entry of entries) {
    const amount = toNumber(entry.amount);

    if (entry.type === LedgerEntryType.DIRECT) {
      addTo(direct, amount);
      continue;
    }

    const team =
      entry.type === LedgerEntryType.OVERRIDE ? entry.dealRule?.team : null;
    const member = entry.sourceAffiliate;

    // Overrides missing a team or a member cannot be paid individually, and
    // neither can bonuses or adjustments. They fall to the catch-all.
    if (!team || !member) {
      addTo(unattributed, amount);
      continue;
    }

    teamNames.set(team.id, team.name);

    const memberKey = `${team.id}:${member.id}`;
    const bucket = members.get(memberKey) ?? {
      amount: 0,
      entryCount: 0,
      name: member.displayName ?? member.email,
      teamId: team.id,
      memberId: member.id,
    };
    addTo(bucket, amount);
    members.set(memberKey, bucket);
  }

  const directOption: PayoutOption | null =
    direct.entryCount > 0
      ? {
          key: payoutTargetKey({ scope: "direct" }),
          target: { scope: "direct" },
          label: "Direct sales",
          sublabel: `Their own commissions · ${plural(direct.entryCount, "sale")}`,
          amount: direct.amount,
          entryCount: direct.entryCount,
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
            amount: member.amount,
            entryCount: member.entryCount,
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
