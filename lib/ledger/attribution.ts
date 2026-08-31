import { LedgerEntryType } from "@prisma/client";
import { isLifetimeSaleType } from "@/lib/affiliate/lifetime";
import { prisma } from "@/lib/prisma";

export type LedgerAttribution = {
  trackedByClick: boolean | null;
  isLifetimeSale: boolean;
};

type AttributableEntry = {
  type: LedgerEntryType;
  slicewpCommissionId: number | null;
};

/**
 * Click tracking plus SliceWP commission type for direct ledger rows.
 * Overrides skip both — the traffic belonged to someone else.
 */
export async function enrichLedgerAttribution<T extends AttributableEntry>(
  entries: T[],
  affiliateId: string
): Promise<Array<T & LedgerAttribution>> {
  const directIds = entries
    .filter((entry) => entry.type === LedgerEntryType.DIRECT)
    .map((entry) => entry.slicewpCommissionId)
    .filter((id): id is number => id !== null);

  const [tracked, commissionTypes] = await Promise.all([
    directIds.length > 0
      ? prisma.visit.findMany({
          where: { affiliateId, slicewpCommissionId: { in: directIds } },
          select: { slicewpCommissionId: true },
          distinct: ["slicewpCommissionId"],
        })
      : Promise.resolve([]),
    directIds.length > 0
      ? prisma.commission.findMany({
          where: { slicewpId: { in: directIds } },
          select: { slicewpId: true, type: true },
        })
      : Promise.resolve([]),
  ]);

  const trackedIds = new Set(tracked.map((visit) => visit.slicewpCommissionId));
  const lifetimeIds = new Set(
    commissionTypes
      .filter((row) => isLifetimeSaleType(row.type))
      .map((row) => row.slicewpId)
  );

  return entries.map((entry) => {
    if (entry.type !== LedgerEntryType.DIRECT) {
      return {
        ...entry,
        trackedByClick: null,
        isLifetimeSale: false,
      };
    }

    const commissionId = entry.slicewpCommissionId;

    return {
      ...entry,
      trackedByClick:
        commissionId !== null && trackedIds.has(commissionId),
      isLifetimeSale:
        commissionId !== null && lifetimeIds.has(commissionId),
    };
  });
}
