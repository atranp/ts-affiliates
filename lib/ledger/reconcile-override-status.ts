import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { prisma } from "../prisma";

export type ReconcileOverrideStatusResult = {
  corrected: number;
};

/**
 * Team bonuses were incorrectly marked PAID when the recruit's SliceWP
 * commission was paid. Only payout batches / explicit paidAt should be PAID.
 */
export async function reconcileMislabeledOverridePayouts(): Promise<ReconcileOverrideStatusResult> {
  const result = await prisma.ledgerEntry.updateMany({
    where: {
      type: LedgerEntryType.OVERRIDE,
      status: CommissionStatus.PAID,
      payoutBatchId: null,
      paidAt: null,
    },
    data: {
      status: CommissionStatus.UNPAID,
    },
  });

  return { corrected: result.count };
}
