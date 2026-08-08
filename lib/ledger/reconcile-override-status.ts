import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { prisma } from "../prisma";
import { overrideStatusForMilestone } from "../milestone";
import { toNumber } from "../utils";

/**
 * Brings existing team bonuses in line with the recruit's SliceWP commission.
 *
 * Direct commissions are still disbursed through SliceWP's payout tool, so a
 * bonus on an order SliceWP has already paid is settled too. Sync applies this
 * rule to rows it touches; this pass fixes history in bulk.
 *
 * Bonuses attached to one of our payout batches are left alone — we disbursed
 * those ourselves and SliceWP has no say over them.
 */

export type OverrideStatusTransition = {
  from: CommissionStatus;
  to: CommissionStatus;
  count: number;
  amount: number;
};

export type ReconcileOverrideStatusResult = {
  scanned: number;
  changed: number;
  skippedLocked: number;
  skippedNoSource: number;
  transitions: OverrideStatusTransition[];
};

export async function reconcileOverrideStatusToSource(options?: {
  dryRun?: boolean;
}): Promise<ReconcileOverrideStatusResult> {
  const dryRun = options?.dryRun ?? false;

  const entries = await prisma.ledgerEntry.findMany({
    where: { type: LedgerEntryType.OVERRIDE },
    select: {
      id: true,
      status: true,
      amount: true,
      payoutBatchId: true,
      paidAt: true,
      sourceAffiliateId: true,
      sourceCommission: { select: { status: true } },
      dealRule: { select: { milestoneRevenueThreshold: true } },
    },
  });

  // Milestone thresholds are measured against lifetime recruit revenue, so the
  // totals are gathered once rather than per entry.
  const revenueRows = await prisma.commission.groupBy({
    by: ["affiliateId"],
    where: { orderRevenue: { not: null } },
    _sum: { orderRevenue: true },
  });
  const revenueByAffiliate = new Map(
    revenueRows.map((row) => [row.affiliateId, toNumber(row._sum.orderRevenue)])
  );

  const idsByTarget = new Map<CommissionStatus, string[]>();
  const transitions = new Map<string, OverrideStatusTransition>();
  let skippedLocked = 0;
  let skippedNoSource = 0;

  for (const entry of entries) {
    if (entry.payoutBatchId || entry.paidAt) {
      skippedLocked += 1;
      continue;
    }
    if (!entry.sourceCommission) {
      skippedNoSource += 1;
      continue;
    }

    const desired = overrideStatusForMilestone(
      entry.sourceCommission.status,
      entry.sourceAffiliateId
        ? (revenueByAffiliate.get(entry.sourceAffiliateId) ?? 0)
        : 0,
      entry.dealRule?.milestoneRevenueThreshold == null
        ? null
        : toNumber(entry.dealRule.milestoneRevenueThreshold)
    );

    if (desired === entry.status) continue;

    const ids = idsByTarget.get(desired) ?? [];
    ids.push(entry.id);
    idsByTarget.set(desired, ids);

    const key = `${entry.status}->${desired}`;
    const transition = transitions.get(key) ?? {
      from: entry.status,
      to: desired,
      count: 0,
      amount: 0,
    };
    transition.count += 1;
    transition.amount += toNumber(entry.amount);
    transitions.set(key, transition);
  }

  const changed = Array.from(idsByTarget.values()).reduce(
    (sum, ids) => sum + ids.length,
    0
  );

  if (!dryRun && changed > 0) {
    await prisma.$transaction(
      Array.from(idsByTarget.entries()).map(([status, ids]) =>
        prisma.ledgerEntry.updateMany({
          where: { id: { in: ids } },
          data: { status },
        })
      )
    );
  }

  return {
    scanned: entries.length,
    changed,
    skippedLocked,
    skippedNoSource,
    transitions: Array.from(transitions.values()).sort(
      (a, b) => b.count - a.count
    ),
  };
}
