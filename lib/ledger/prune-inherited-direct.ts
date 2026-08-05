import { prisma } from "@/lib/prisma";

export type PruneInheritedResult = {
  removed: number;
  removedAmount: number;
  keptSettled: number;
  keptSettledAmount: number;
};

/**
 * Removes DIRECT ledger lines that duplicate a tier-2 bonus we already model as
 * an OVERRIDE. SliceWP emits its own "inherit" commission for the sponsor, and
 * turning that into a ledger line as well counts the same bonus twice.
 *
 * Only open rows are removed. Anything already paid or attached to a payout
 * batch stays put, because deleting it would stop that batch from reconciling
 * against the amount that was actually disbursed.
 */
export async function pruneInheritedDirectEntries(): Promise<PruneInheritedResult> {
  const [open] = await prisma.$queryRaw<Array<{ n: bigint; total: string }>>`
    SELECT count(*) AS n, coalesce(sum(le."amount"), 0)::text AS total
    FROM "LedgerEntry" le
    JOIN "Commission" c ON c."id" = le."sourceCommissionId"
    WHERE le."type" = 'DIRECT'
      AND lower(coalesce(c."type", '')) = 'inherit'
      AND le."status" <> 'PAID'
      AND le."payoutBatchId" IS NULL
  `;

  const [settled] = await prisma.$queryRaw<Array<{ n: bigint; total: string }>>`
    SELECT count(*) AS n, coalesce(sum(le."amount"), 0)::text AS total
    FROM "LedgerEntry" le
    JOIN "Commission" c ON c."id" = le."sourceCommissionId"
    WHERE le."type" = 'DIRECT'
      AND lower(coalesce(c."type", '')) = 'inherit'
      AND (le."status" = 'PAID' OR le."payoutBatchId" IS NOT NULL)
  `;

  const removed = await prisma.$executeRaw`
    DELETE FROM "LedgerEntry" AS le
    USING "Commission" AS c
    WHERE c."id" = le."sourceCommissionId"
      AND le."type" = 'DIRECT'
      AND lower(coalesce(c."type", '')) = 'inherit'
      AND le."status" <> 'PAID'
      AND le."payoutBatchId" IS NULL
  `;

  return {
    removed,
    removedAmount: Number(open.total),
    keptSettled: Number(settled.n),
    keptSettledAmount: Number(settled.total),
  };
}
