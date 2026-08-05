import { prisma } from "@/lib/prisma";

export type BackfillOccurredAtResult = {
  direct: number;
  overrides: number;
  fallback: number;
};

/**
 * Points occurredAt at the sale date instead of the row's insert time.
 *
 * Ledger rows were created by sync, so createdAt clusters on whichever days
 * sync happened to run. Every statement is idempotent, so this is safe to
 * re-run after a backlog import.
 */
export async function backfillLedgerOccurredAt(): Promise<BackfillOccurredAtResult> {
  const direct = await prisma.$executeRaw`
    UPDATE "LedgerEntry" AS le
    SET "occurredAt" = c."dateCreated"
    FROM "Commission" AS c
    WHERE le."type" = 'DIRECT'
      AND le."slicewpCommissionId" = c."slicewpId"
      AND le."affiliateId" = c."affiliateId"
      AND le."occurredAt" IS DISTINCT FROM c."dateCreated"
  `;

  // Team bonuses inherit the date of the sale that triggered them.
  const overrides = await prisma.$executeRaw`
    UPDATE "LedgerEntry" AS le
    SET "occurredAt" = c."dateCreated"
    FROM "Commission" AS c
    WHERE le."sourceCommissionId" = c."id"
      AND le."occurredAt" IS DISTINCT FROM c."dateCreated"
  `;

  // Manual adjustments have no commission behind them, and neither do rows
  // whose commission was deleted — for those the insert time is the best date
  // available.
  const fallback = await prisma.$executeRaw`
    UPDATE "LedgerEntry" AS le
    SET "occurredAt" = le."createdAt"
    WHERE le."occurredAt" <> le."createdAt"
      AND NOT EXISTS (
        SELECT 1 FROM "Commission" AS c
        WHERE c."id" = le."sourceCommissionId"
           OR (
             le."slicewpCommissionId" IS NOT NULL
             AND c."slicewpId" = le."slicewpCommissionId"
             AND c."affiliateId" = le."affiliateId"
           )
      )
  `;

  return { direct, overrides, fallback };
}
