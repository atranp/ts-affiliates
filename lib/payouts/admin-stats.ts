import { CommissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfStoreMonth } from "@/lib/payouts/store-dates";
import { toNumber } from "@/lib/utils";

function batchTotal(
  items: Array<{ totalAmount: unknown }>
): number {
  return items.reduce((sum, item) => sum + toNumber(item.totalAmount), 0);
}

export type PayoutAdminStats = {
  recordedThisMonthTotal: number;
  recordedThisMonthCount: number;
  affiliatesWithUnpaidCount: number;
  totalUnpaidLedger: number;
};

export async function getPayoutAdminStats(): Promise<PayoutAdminStats> {
  const monthStart = startOfStoreMonth(new Date());

  const [
    recordedThisMonthBatches,
    unpaidAffiliateGroups,
    unpaidLedgerSum,
  ] = await Promise.all([
    prisma.payoutBatch.findMany({
      where: {
        processedAt: { gte: monthStart },
      },
      include: { items: true },
    }),
    prisma.ledgerEntry.groupBy({
      by: ["affiliateId"],
      where: { status: CommissionStatus.UNPAID },
    }),
    prisma.ledgerEntry.aggregate({
      where: { status: CommissionStatus.UNPAID },
      _sum: { amount: true },
    }),
  ]);

  return {
    recordedThisMonthTotal: recordedThisMonthBatches.reduce(
      (sum, batch) => sum + batchTotal(batch.items),
      0
    ),
    recordedThisMonthCount: recordedThisMonthBatches.length,
    affiliatesWithUnpaidCount: unpaidAffiliateGroups.length,
    totalUnpaidLedger: toNumber(unpaidLedgerSum._sum.amount),
  };
}
