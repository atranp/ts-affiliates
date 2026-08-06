import { CommissionStatus, PayoutBatchStatus } from "@prisma/client";
import { startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";

function batchTotal(
  items: Array<{ totalAmount: unknown }>
): number {
  return items.reduce((sum, item) => sum + toNumber(item.totalAmount), 0);
}

export type PayoutAdminStats = {
  awaitingPaymentTotal: number;
  openBatchCount: number;
  paidThisMonthTotal: number;
  affiliatesWithUnpaidCount: number;
  totalUnpaidLedger: number;
};

export async function getPayoutAdminStats(): Promise<PayoutAdminStats> {
  const monthStart = startOfMonth(new Date());

  const [
    processingBatches,
    paidThisMonthBatches,
    unpaidAffiliateGroups,
    unpaidLedgerSum,
  ] = await Promise.all([
    prisma.payoutBatch.findMany({
      where: { status: PayoutBatchStatus.PROCESSING },
      include: { items: true },
    }),
    prisma.payoutBatch.findMany({
      where: {
        status: PayoutBatchStatus.COMPLETED,
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
    awaitingPaymentTotal: processingBatches.reduce(
      (sum, batch) => sum + batchTotal(batch.items),
      0
    ),
    openBatchCount: processingBatches.length,
    paidThisMonthTotal: paidThisMonthBatches.reduce(
      (sum, batch) => sum + batchTotal(batch.items),
      0
    ),
    affiliatesWithUnpaidCount: unpaidAffiliateGroups.length,
    totalUnpaidLedger: toNumber(unpaidLedgerSum._sum.amount),
  };
}
