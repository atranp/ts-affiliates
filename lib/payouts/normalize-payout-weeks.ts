import { prisma } from "@/lib/prisma";

export type NormalizePayoutWeeksResult = {
  drifted: number;
  normalized: number;
  skippedSettled: number;
};

/**
 * Snaps payout weeks onto UTC midnight.
 *
 * Payout weeks used to be derived with local-time math, so rows written from a
 * non-UTC machine landed hours off the intended Monday. Since the admin's
 * period filter compares against this column, those rows fell outside the
 * natural payout range and were silently never paid.
 *
 * Only open entries are touched — anything already paid or attached to a batch
 * is left as a record of what actually happened.
 */
export async function normalizePayoutWeeks(): Promise<NormalizePayoutWeeksResult> {
  const [drifted] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n
    FROM "LedgerEntry"
    WHERE "payoutWeek" IS NOT NULL
      AND "payoutWeek" <> date_trunc('day', "payoutWeek" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND "status" <> 'PAID'
      AND "payoutBatchId" IS NULL
  `;

  const [settled] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n
    FROM "LedgerEntry"
    WHERE "payoutWeek" IS NOT NULL
      AND "payoutWeek" <> date_trunc('day', "payoutWeek" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND ("status" = 'PAID' OR "payoutBatchId" IS NOT NULL)
  `;

  /**
   * Rounds to the nearest UTC day rather than truncating: a week stamped at
   * 17:00 the previous day was aiming at the following midnight, so truncating
   * would move it a week earlier.
   */
  const normalized = await prisma.$executeRaw`
    UPDATE "LedgerEntry"
    SET "payoutWeek" = date_trunc('day', ("payoutWeek" + interval '12 hours') AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        "updatedAt"  = now()
    WHERE "payoutWeek" IS NOT NULL
      AND "payoutWeek" <> date_trunc('day', "payoutWeek" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND "status" <> 'PAID'
      AND "payoutBatchId" IS NULL
  `;

  return {
    drifted: Number(drifted.n),
    normalized,
    skippedSettled: Number(settled.n),
  };
}
