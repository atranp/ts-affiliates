import { PayoutWriteBackStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";

/**
 * Whether this app and SliceWP still agree about what has been paid.
 *
 * Two different disagreements, which need separating because they mean
 * different things:
 *
 *   - **Outstanding write-backs.** A payout committed here that SliceWP has
 *     not accepted. Known, expected, and fixed by retrying.
 *   - **Drift.** A batch this app believes settled, where the mirrored
 *     commission still is not paid. Nobody knows about this one, and retrying
 *     will not help — it means the settle reported success but SliceWP does not
 *     reflect it, or something changed the commission afterwards.
 */

export type OutstandingBatch = {
  id: string;
  label: string;
  status: PayoutWriteBackStatus;
  error: string | null;
  attempts: number;
  processedAt: string | null;
  totalAmount: number;
  sponsorAffiliateId: string | null;
  sponsorName: string | null;
};

export type WriteBackHealth = {
  failed: number;
  pending: number;
  /** Settled batches whose commissions did not come back paid. */
  drifted: number;
  batches: OutstandingBatch[];
};

/**
 * Only `SETTLED` batches are examined. A batch that is still `PENDING` or
 * `FAILED` is supposed to disagree with SliceWP — counting it here as well
 * would double-report the same problem under a scarier name.
 *
 * And only batches settled *before* the last commission sync, because the
 * mirror is the evidence. A payout settled since then has simply not been read
 * back yet, which is not drift; without this the banner would accuse itself
 * every time someone ran a payout.
 */
async function countDrift(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "LedgerEntry" AS le
    JOIN "PayoutBatch" AS b ON b."id" = le."payoutBatchId"
    JOIN "Commission"  AS c
      ON c."slicewpId"   = le."slicewpCommissionId"
     AND c."affiliateId" = le."affiliateId"
    CROSS JOIN (
      SELECT "lastCommissionSyncAt" AS synced_at FROM "Settings" LIMIT 1
    ) AS s
    WHERE le."type"   = 'DIRECT'
      AND le."status" = 'PAID'
      AND b."writeBackStatus" = ${PayoutWriteBackStatus.SETTLED}::"PayoutWriteBackStatus"
      AND b."settledAt" < s.synced_at
      AND c."status" <> 'PAID'
  `;

  return Number(rows[0]?.count ?? 0);
}

export async function getWriteBackHealth(
  limit = 25
): Promise<WriteBackHealth> {
  const [grouped, batches, drifted] = await Promise.all([
    prisma.payoutBatch.groupBy({
      by: ["writeBackStatus"],
      _count: { _all: true },
      where: {
        writeBackStatus: {
          in: [PayoutWriteBackStatus.FAILED, PayoutWriteBackStatus.PENDING],
        },
      },
    }),
    prisma.payoutBatch.findMany({
      where: {
        writeBackStatus: {
          in: [PayoutWriteBackStatus.FAILED, PayoutWriteBackStatus.PENDING],
        },
      },
      orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        label: true,
        writeBackStatus: true,
        writeBackError: true,
        writeBackAttempts: true,
        processedAt: true,
        sponsorAffiliateId: true,
        items: { select: { totalAmount: true } },
      },
    }),
    countDrift(),
  ]);

  const countFor = (status: PayoutWriteBackStatus) =>
    grouped.find((row) => row.writeBackStatus === status)?._count._all ?? 0;

  const sponsorIds = Array.from(
    new Set(
      batches
        .map((batch) => batch.sponsorAffiliateId)
        .filter((id): id is string => !!id)
    )
  );

  const sponsors = sponsorIds.length
    ? await prisma.affiliate.findMany({
        where: { id: { in: sponsorIds } },
        select: { id: true, displayName: true, email: true },
      })
    : [];

  const nameById = new Map(
    sponsors.map((sponsor) => [
      sponsor.id,
      sponsor.displayName ?? sponsor.email,
    ])
  );

  return {
    failed: countFor(PayoutWriteBackStatus.FAILED),
    pending: countFor(PayoutWriteBackStatus.PENDING),
    drifted,
    batches: batches.map((batch) => ({
      id: batch.id,
      label: batch.label,
      status: batch.writeBackStatus,
      error: batch.writeBackError,
      attempts: batch.writeBackAttempts,
      processedAt: batch.processedAt?.toISOString() ?? null,
      totalAmount: batch.items.reduce(
        (sum, item) => sum + toNumber(item.totalAmount),
        0
      ),
      sponsorAffiliateId: batch.sponsorAffiliateId,
      sponsorName: batch.sponsorAffiliateId
        ? (nameById.get(batch.sponsorAffiliateId) ?? null)
        : null,
    })),
  };
}

/** Batches whose write-back is still outstanding, for the admin banner. */
export async function countOutstandingWriteBacks(): Promise<number> {
  return prisma.payoutBatch.count({
    where: {
      writeBackStatus: {
        in: [PayoutWriteBackStatus.FAILED, PayoutWriteBackStatus.PENDING],
      },
    },
  });
}