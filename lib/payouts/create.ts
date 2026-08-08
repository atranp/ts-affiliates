import { CommissionStatus, LedgerEntryType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAID_STATUS } from "@/lib/payouts/status";
import { formatAppDateTime } from "@/lib/timezone";
import { toNumber } from "@/lib/utils";

/**
 * Creating a payout is a two-call flow: preview what would be paid, then pay
 * exactly that. Both calls run off the same selection so the receipt can never
 * describe something the admin did not see.
 */

/**
 * What a payout covers. Team earnings are always paid one member at a time so
 * each receipt can be reconciled against that member's own sales report; the
 * team itself is a grouping, not a payable target.
 */
export type PayoutTarget =
  | { scope: "direct" }
  | { scope: "member"; teamId: string; memberId: string };

export type PayoutScopeName = PayoutTarget["scope"];

export type PayoutSelection = {
  affiliateId: string;
  target: PayoutTarget;
  cutoff: Date;
};

export type PayoutDraftEntry = {
  id: string;
  occurredAt: string;
  type: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: number | null;
  amount: number;
  sourceAffiliateName: string | null;
};

export type PayoutDraftTotals = {
  entryCount: number;
  totalAmount: number;
};

export type PayoutDraft = PayoutDraftTotals & {
  affiliateId: string;
  affiliateName: string;
  target: PayoutTarget;
  /** Human phrase for the target, e.g. "Ridgeline team". */
  targetLabel: string;
  /** Exact instant the payout stops at, chosen by the server and echoed back on create. */
  cutoff: string;
  oldestOccurredAt: string | null;
  newestOccurredAt: string | null;
  entries: PayoutDraftEntry[];
  entriesTruncated: boolean;
};

export type CreatedPayout = PayoutDraftTotals & {
  batchId: string;
  label: string;
  processedAt: string;
};

export const PREVIEW_ENTRY_LIMIT = 50;

/** Allows for a client clock running slightly ahead of the server. */
const CUTOFF_SKEW_TOLERANCE_MS = 60_000;

export class PayoutInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutInputError";
  }
}

/** The unpaid pool moved between preview and create, so the write was abandoned. */
export class PayoutConflictError extends Error {
  constructor(
    message: string,
    readonly actual: PayoutDraftTotals
  ) {
    super(message);
    this.name = "PayoutConflictError";
  }
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PayoutInputError(`${field} is required for this payout scope.`);
  }
  return value;
}

export function parsePayoutTarget(input: {
  scope: unknown;
  teamId?: unknown;
  memberId?: unknown;
}): PayoutTarget {
  switch (input.scope) {
    case "direct":
      return { scope: "direct" };
    case "member":
      return {
        scope: "member",
        teamId: requireId(input.teamId, "teamId"),
        memberId: requireId(input.memberId, "memberId"),
      };
    default:
      throw new PayoutInputError(
        `Unknown payout scope "${String(input.scope)}". Expected direct or member.`
      );
  }
}

/**
 * Stable identity for a target, used as the selection key in the UI. Member
 * keys carry the team too, since one person can sit under two of a sponsor's
 * teams and would otherwise collide.
 */
export function payoutTargetKey(target: PayoutTarget): string {
  return target.scope === "member"
    ? `member:${target.teamId}:${target.memberId}`
    : target.scope;
}

/**
 * Defaults to right now. A supplied cutoff must have come from an earlier
 * preview, so anything in the future means a bad clock or a hand-rolled request.
 */
export function parsePayoutCutoff(value: unknown, now = new Date()): Date {
  if (value == null || value === "") return now;

  const cutoff = new Date(String(value));
  if (Number.isNaN(cutoff.getTime())) {
    throw new PayoutInputError("Cutoff is not a valid timestamp.");
  }
  if (cutoff.getTime() > now.getTime() + CUTOFF_SKEW_TOLERANCE_MS) {
    throw new PayoutInputError("Cutoff cannot be in the future.");
  }
  return cutoff;
}

/**
 * Unpaid commissions up to an instant. There is deliberately no lower bound:
 * "everything still owed" is the question being asked, and an entry that was
 * synced late would otherwise fall through the gap between two payouts.
 */
export function buildUnpaidWhere(
  selection: PayoutSelection
): Prisma.LedgerEntryWhereInput {
  const base: Prisma.LedgerEntryWhereInput = {
    affiliateId: selection.affiliateId,
    status: CommissionStatus.UNPAID,
    // Matched against the moment the payout is recorded rather than the end of
    // the calendar day, so a sale landing later today stays open for next time.
    occurredAt: { lte: selection.cutoff },
  };

  const { target } = selection;

  switch (target.scope) {
    case "direct":
      return { ...base, type: LedgerEntryType.DIRECT };

    // The sponsor's override bonuses on one member's sales. Scoped by team as
    // well as member, since the same person can sit under two of a sponsor's
    // teams through different deal rules.
    case "member":
      return {
        ...base,
        type: LedgerEntryType.OVERRIDE,
        sourceAffiliateId: target.memberId,
        dealRule: { teamId: target.teamId },
      };
  }
}

type TargetContext = {
  affiliateName: string;
  targetLabel: string;
  teamId: string | null;
};

/**
 * Resolves display names and, for member targets, checks the team really
 * belongs to this sponsor so one ambassador cannot be paid under another's team.
 */
async function loadTargetContext(
  selection: PayoutSelection
): Promise<TargetContext> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: selection.affiliateId },
    select: { displayName: true, email: true },
  });
  if (!affiliate) {
    throw new PayoutInputError("Affiliate not found.");
  }
  const affiliateName = affiliate.displayName ?? affiliate.email;

  const { target } = selection;

  if (target.scope === "direct") {
    return { affiliateName, targetLabel: "direct sales", teamId: null };
  }

  const team = await prisma.team.findUnique({
    where: { id: target.teamId },
    select: { name: true, sponsorAffiliateId: true },
  });
  if (!team) {
    throw new PayoutInputError("Team not found.");
  }
  if (team.sponsorAffiliateId !== selection.affiliateId) {
    throw new PayoutInputError("That team belongs to a different ambassador.");
  }

  const member = await prisma.affiliate.findUnique({
    where: { id: target.memberId },
    select: { displayName: true, email: true },
  });
  if (!member) {
    throw new PayoutInputError("Team member not found.");
  }

  return {
    affiliateName,
    targetLabel: `${member.displayName ?? member.email} · ${team.name}`,
    teamId: target.teamId,
  };
}

export function buildPayoutLabel(
  context: TargetContext,
  cutoff: Date
): string {
  return `${context.affiliateName} · ${context.targetLabel} through ${formatAppDateTime(cutoff)}`;
}

export async function previewPayout(
  selection: PayoutSelection
): Promise<PayoutDraft> {
  const where = buildUnpaidWhere(selection);

  const [context, totals, entries] = await Promise.all([
    loadTargetContext(selection),
    prisma.ledgerEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { amount: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    }),
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: PREVIEW_ENTRY_LIMIT,
      select: {
        id: true,
        occurredAt: true,
        type: true,
        description: true,
        wooOrderId: true,
        orderRevenue: true,
        amount: true,
        sourceAffiliate: { select: { displayName: true, email: true } },
      },
    }),
  ]);

  const entryCount = totals._count._all;

  return {
    affiliateId: selection.affiliateId,
    affiliateName: context.affiliateName,
    target: selection.target,
    targetLabel: context.targetLabel,
    cutoff: selection.cutoff.toISOString(),
    entryCount,
    totalAmount: toNumber(totals._sum.amount),
    oldestOccurredAt: totals._min.occurredAt?.toISOString() ?? null,
    newestOccurredAt: totals._max.occurredAt?.toISOString() ?? null,
    entries: entries.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      type: entry.type,
      description: entry.description,
      wooOrderId: entry.wooOrderId,
      orderRevenue:
        entry.orderRevenue == null ? null : toNumber(entry.orderRevenue),
      amount: toNumber(entry.amount),
      sourceAffiliateName: entry.sourceAffiliate
        ? (entry.sourceAffiliate.displayName ?? entry.sourceAffiliate.email)
        : null,
    })),
    entriesTruncated: entryCount > entries.length,
  };
}

/** Compared in cents so a float round-trip through JSON cannot fail the check. */
function sameTotals(a: PayoutDraftTotals, b: PayoutDraftTotals): boolean {
  return (
    a.entryCount === b.entryCount &&
    Math.round(a.totalAmount * 100) === Math.round(b.totalAmount * 100)
  );
}

export type CreatePayoutInput = PayoutSelection & {
  /** Totals the admin approved. The payout aborts if the pool has since moved. */
  expected?: PayoutDraftTotals;
};

export async function createPayout(
  input: CreatePayoutInput
): Promise<CreatedPayout> {
  const context = await loadTargetContext(input);
  const where = buildUnpaidWhere(input);
  const recordedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const totals = await tx.ledgerEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { amount: true },
      _min: { occurredAt: true },
    });

    const actual: PayoutDraftTotals = {
      entryCount: totals._count._all,
      totalAmount: toNumber(totals._sum.amount),
    };

    if (actual.entryCount === 0) {
      throw new PayoutInputError(
        "Nothing unpaid matches this selection any more."
      );
    }

    if (input.expected && !sameTotals(actual, input.expected)) {
      throw new PayoutConflictError(
        "The unpaid total changed while you were reviewing it.",
        actual
      );
    }

    const batch = await tx.payoutBatch.create({
      data: {
        label: buildPayoutLabel(context, input.cutoff),
        // The receipt spans the oldest sale it settles through the cutoff,
        // which is the range an ambassador can actually reconcile against.
        periodStart: totals._min.occurredAt ?? input.cutoff,
        periodEnd: input.cutoff,
        status: PAID_STATUS,
        processedAt: recordedAt,
        sponsorAffiliateId: input.affiliateId,
        teamId: context.teamId,
      },
    });

    const { count } = await tx.ledgerEntry.updateMany({
      // Re-asserting UNPAID makes this a compare-and-set: a concurrent payout
      // that claimed some of these rows first shows up as a short count.
      where: { ...where, status: CommissionStatus.UNPAID },
      data: {
        status: CommissionStatus.PAID,
        paidAt: recordedAt,
        payoutBatchId: batch.id,
      },
    });

    if (count !== actual.entryCount) {
      throw new PayoutConflictError(
        "Some of these commissions were paid by another payout just now.",
        { entryCount: count, totalAmount: actual.totalAmount }
      );
    }

    await tx.payoutBatchItem.create({
      data: {
        batchId: batch.id,
        affiliateId: input.affiliateId,
        totalAmount: totals._sum.amount ?? new Prisma.Decimal(0),
        entryCount: actual.entryCount,
      },
    });

    return {
      batchId: batch.id,
      label: batch.label,
      entryCount: actual.entryCount,
      totalAmount: actual.totalAmount,
      processedAt: recordedAt.toISOString(),
    };
  });
}
