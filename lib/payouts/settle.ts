import { LedgerEntryType, PayoutWriteBackStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { settlePayment, SliceWPSettleError } from "@/lib/slicewp-bridge";
import { toNumber } from "@/lib/utils";

/**
 * Reflects a completed payout batch back into SliceWP.
 *
 * Runs after the batch has committed, never inside its transaction: the settle
 * call is HTTP, and holding a database transaction open across it — or rolling
 * a committed payout back because a remote call failed — is worse than the two
 * systems being briefly out of step. `PayoutBatch.writeBackStatus` is the
 * record of that gap, and this module is the only thing that moves it.
 *
 * Retry is always safe. The batch id is the idempotency key, so a settle that
 * actually landed but failed on the way back returns the same payment on the
 * next attempt with `replayed: true`.
 */

export type SettleResult = {
  batchId: string;
  status: PayoutWriteBackStatus;
  slicewpPaymentId: number | null;
  /** What SliceWP was told to pay — direct entries only. */
  settledAmount: number | null;
  commissionCount: number;
  replayed: boolean;
  error: string | null;
};

/**
 * The SliceWP commissions a batch is able to settle.
 *
 * Only DIRECT entries qualify. Overrides are computed here from `DealRule`
 * rows and have no SliceWP commission behind them, so a batch of nothing but
 * overrides has nothing to tell SliceWP about — which is a complete settlement,
 * not a failed one.
 */
async function loadSettleableEntries(batchId: string) {
  return prisma.ledgerEntry.findMany({
    where: {
      payoutBatchId: batchId,
      type: LedgerEntryType.DIRECT,
      slicewpCommissionId: { not: null },
    },
    select: { slicewpCommissionId: true, amount: true },
  });
}

export async function batchWriteBackStatusFor(
  tx: Prisma.TransactionClient,
  batchId: string
): Promise<PayoutWriteBackStatus> {
  const settleable = await tx.ledgerEntry.count({
    where: {
      payoutBatchId: batchId,
      type: LedgerEntryType.DIRECT,
      slicewpCommissionId: { not: null },
    },
  });

  return settleable > 0
    ? PayoutWriteBackStatus.PENDING
    : PayoutWriteBackStatus.NOT_REQUIRED;
}

function describe(error: unknown): string {
  if (error instanceof SliceWPSettleError) {
    return `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Attempts the write-back and records the outcome on the batch.
 *
 * Never throws for a failed settlement — the payout itself already succeeded,
 * and the caller needs the batch back so it can tell the admin what is now
 * outstanding. Only a missing batch throws.
 */
export async function settlePayoutBatch(batchId: string): Promise<SettleResult> {
  const batch = await prisma.payoutBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      sponsorAffiliateId: true,
      writeBackStatus: true,
      slicewpPaymentId: true,
      settledAmount: true,
    },
  });

  if (!batch) {
    throw new Error(`Payout batch ${batchId} not found.`);
  }

  const idle = (
    status: PayoutWriteBackStatus,
    commissionCount: number
  ): SettleResult => ({
    batchId,
    status,
    slicewpPaymentId: batch.slicewpPaymentId,
    settledAmount:
      batch.settledAmount == null ? null : toNumber(batch.settledAmount),
    commissionCount,
    replayed: false,
    error: null,
  });

  if (batch.writeBackStatus === PayoutWriteBackStatus.SETTLED) {
    return idle(PayoutWriteBackStatus.SETTLED, 0);
  }

  const entries = await loadSettleableEntries(batchId);

  if (entries.length === 0) {
    await prisma.payoutBatch.update({
      where: { id: batchId },
      data: {
        writeBackStatus: PayoutWriteBackStatus.NOT_REQUIRED,
        writeBackError: null,
      },
    });
    return idle(PayoutWriteBackStatus.NOT_REQUIRED, 0);
  }

  if (!batch.sponsorAffiliateId) {
    return recordFailure(
      batchId,
      entries.length,
      "Batch has no affiliate to pay, so it cannot be settled in SliceWP."
    );
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: batch.sponsorAffiliateId },
    select: { slicewpId: true },
  });

  if (!affiliate) {
    return recordFailure(
      batchId,
      entries.length,
      "The affiliate this batch pays is no longer in the mirror."
    );
  }

  const commissionIds = entries
    .map((entry) => entry.slicewpCommissionId)
    .filter((id): id is number => id != null);

  // Sent explicitly rather than left to the bridge's own sum, so a mirror that
  // has drifted from SliceWP shows up as a mismatched receipt instead of
  // quietly paying whatever SliceWP happens to think the commissions are worth.
  const amount = entries.reduce(
    (total, entry) => total.add(entry.amount),
    new Prisma.Decimal(0)
  );

  try {
    const receipt = await settlePayment({
      affiliate_id: affiliate.slicewpId,
      commission_ids: commissionIds,
      idempotency_key: batchId,
      amount: amount.toFixed(2),
    });

    await prisma.payoutBatch.update({
      where: { id: batchId },
      data: {
        writeBackStatus: PayoutWriteBackStatus.SETTLED,
        slicewpPaymentId: Number(receipt.id),
        settledAmount: amount,
        settledAt: new Date(),
        writeBackError: null,
        writeBackAttemptedAt: new Date(),
        writeBackAttempts: { increment: 1 },
      },
    });

    return {
      batchId,
      status: PayoutWriteBackStatus.SETTLED,
      slicewpPaymentId: Number(receipt.id),
      settledAmount: toNumber(amount),
      commissionCount: commissionIds.length,
      replayed: receipt.replayed === true,
      error: null,
    };
  } catch (error) {
    return recordFailure(batchId, commissionIds.length, describe(error));
  }
}

async function recordFailure(
  batchId: string,
  commissionCount: number,
  message: string
): Promise<SettleResult> {
  const batch = await prisma.payoutBatch.update({
    where: { id: batchId },
    data: {
      writeBackStatus: PayoutWriteBackStatus.FAILED,
      writeBackError: message,
      writeBackAttemptedAt: new Date(),
      writeBackAttempts: { increment: 1 },
    },
    select: { slicewpPaymentId: true },
  });

  return {
    batchId,
    status: PayoutWriteBackStatus.FAILED,
    slicewpPaymentId: batch.slicewpPaymentId,
    settledAmount: null,
    commissionCount,
    replayed: false,
    error: message,
  };
}
