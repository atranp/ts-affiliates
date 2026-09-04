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
  wooOrderId?: number | null;
};

export type TrackedByClickInput = {
  slicewpCommissionId: number | null;
  visitLinkedCommissionIds: ReadonlySet<number>;
  visitSlicewpId: number | null;
  wooOrderId: number | null;
  orderReferrerVisitByOrderId: ReadonlyMap<number, number>;
};

/**
 * Whether a direct sale can be traced to a click on this affiliate's link.
 *
 * True when SliceWP recorded a visit on the commission, the commission row
 * carries a visit id, or order meta still has a referrer visit id (common when
 * SliceWP leaves commission.visit_id at zero).
 */
export function resolveTrackedByClick(input: TrackedByClickInput): boolean {
  const commissionId = input.slicewpCommissionId;
  if (commissionId === null) return false;

  if (input.visitLinkedCommissionIds.has(commissionId)) return true;
  if (input.visitSlicewpId !== null && input.visitSlicewpId > 0) return true;

  if (input.wooOrderId !== null) {
    const referrerVisit = input.orderReferrerVisitByOrderId.get(input.wooOrderId);
    if (referrerVisit !== undefined && referrerVisit > 0) return true;
  }

  return false;
}

/**
 * Click tracking plus SliceWP commission type for direct ledger rows.
 * Overrides skip both — the traffic belonged to someone else.
 */
export async function enrichLedgerAttribution<T extends AttributableEntry>(
  entries: T[],
  affiliateId: string
): Promise<Array<T & LedgerAttribution>> {
  const directEntries = entries.filter(
    (entry) => entry.type === LedgerEntryType.DIRECT
  );
  const directIds = directEntries
    .map((entry) => entry.slicewpCommissionId)
    .filter((id): id is number => id !== null);
  const wooOrderIds = directEntries
    .map((entry) => entry.wooOrderId ?? null)
    .filter((id): id is number => id !== null);

  const [tracked, commissionRows, orderAttributions] = await Promise.all([
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
          select: { slicewpId: true, type: true, visitSlicewpId: true },
        })
      : Promise.resolve([]),
    wooOrderIds.length > 0
      ? prisma.orderAttribution.findMany({
          where: { wooOrderId: { in: wooOrderIds } },
          select: { wooOrderId: true, referrerVisitSlicewpId: true },
        })
      : Promise.resolve([]),
  ]);

  const visitLinkedCommissionIds = new Set(
    tracked
      .map((visit) => visit.slicewpCommissionId)
      .filter((id): id is number => id !== null)
  );
  const visitSlicewpIdByCommission = new Map(
    commissionRows.map((row) => [row.slicewpId, row.visitSlicewpId])
  );
  const lifetimeIds = new Set(
    commissionRows
      .filter((row) => isLifetimeSaleType(row.type))
      .map((row) => row.slicewpId)
  );
  const orderReferrerVisitByOrderId = new Map(
    orderAttributions.map((row) => [
      row.wooOrderId,
      row.referrerVisitSlicewpId ?? 0,
    ])
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
      trackedByClick: resolveTrackedByClick({
        slicewpCommissionId: commissionId,
        visitLinkedCommissionIds,
        visitSlicewpId:
          commissionId !== null
            ? (visitSlicewpIdByCommission.get(commissionId) ?? null)
            : null,
        wooOrderId: entry.wooOrderId ?? null,
        orderReferrerVisitByOrderId,
      }),
      isLifetimeSale:
        commissionId !== null && lifetimeIds.has(commissionId),
    };
  });
}
