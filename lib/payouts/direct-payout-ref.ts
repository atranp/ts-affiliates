import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAID_STATUS } from "@/lib/payouts/status";
import { formatAppDate } from "@/lib/timezone";
import { formatCurrency, toNumber } from "@/lib/utils";

/** A recruit's direct payout receipt — team earnings settle against this. */
export type DirectPayoutRef =
  | { source: "slicewp"; paymentId: string }
  | { source: "platform"; batchId: string };

export type DirectPayoutAnchor = DirectPayoutRef & {
  memberAffiliateId: string;
  amount: number;
  entryCount: number;
  paidAt: Date;
  label: string;
  commissionIds: string[];
};

const PAID_SLICEWP = "paid";

export function parseDirectPayoutRef(input: {
  directPayoutSource?: unknown;
  directPayoutId?: unknown;
}): DirectPayoutRef | undefined {
  const source = input.directPayoutSource;
  const id = input.directPayoutId;
  if (typeof source !== "string" || typeof id !== "string" || !id.trim()) {
    return undefined;
  }
  if (source === "slicewp") return { source: "slicewp", paymentId: id.trim() };
  if (source === "platform") return { source: "platform", batchId: id.trim() };
  return undefined;
}

export function directPayoutRefKey(ref: DirectPayoutRef): string {
  return ref.source === "slicewp"
    ? `slicewp:${ref.paymentId}`
    : `platform:${ref.batchId}`;
}

export async function resolveCommissionIdsForDirectPayout(
  ref: DirectPayoutRef,
  memberAffiliateId: string
): Promise<string[]> {
  if (ref.source === "slicewp") {
    const payment = await prisma.slicewpPayment.findFirst({
      where: {
        id: ref.paymentId,
        affiliateId: memberAffiliateId,
        status: PAID_SLICEWP,
      },
      select: { commissionIds: true },
    });
    if (!payment || payment.commissionIds.length === 0) return [];

    const commissions = await prisma.commission.findMany({
      where: {
        affiliateId: memberAffiliateId,
        slicewpId: { in: payment.commissionIds },
      },
      select: { id: true },
    });
    return commissions.map((row) => row.id);
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      payoutBatchId: ref.batchId,
      affiliateId: memberAffiliateId,
      type: LedgerEntryType.DIRECT,
    },
    select: { sourceCommissionId: true, slicewpCommissionId: true },
  });

  if (entries.length === 0) return [];

  const explicit = entries
    .map((entry) => entry.sourceCommissionId)
    .filter((id): id is string => !!id);
  if (explicit.length === entries.length) return explicit;

  const slicewpIds = entries
    .map((entry) => entry.slicewpCommissionId)
    .filter((id): id is number => id != null);

  if (slicewpIds.length === 0) return explicit;

  const bySlicewp = await prisma.commission.findMany({
    where: {
      affiliateId: memberAffiliateId,
      slicewpId: { in: slicewpIds },
    },
    select: { id: true },
  });

  return Array.from(
    new Set([...explicit, ...bySlicewp.map((row) => row.id)])
  );
}

export async function loadDirectPayoutAnchor(
  ref: DirectPayoutRef,
  memberAffiliateId: string
): Promise<DirectPayoutAnchor | null> {
  const commissionIds = await resolveCommissionIdsForDirectPayout(
    ref,
    memberAffiliateId
  );
  if (commissionIds.length === 0) return null;

  if (ref.source === "slicewp") {
    const payment = await prisma.slicewpPayment.findFirst({
      where: {
        id: ref.paymentId,
        affiliateId: memberAffiliateId,
        status: PAID_SLICEWP,
      },
      select: {
        id: true,
        amount: true,
        commissionIds: true,
        dateCreated: true,
        dateModified: true,
      },
    });
    if (!payment) return null;

    const paidAt = payment.dateModified ?? payment.dateCreated;
    const amount = toNumber(payment.amount);

    return {
      source: "slicewp",
      paymentId: payment.id,
      memberAffiliateId,
      amount,
      entryCount: payment.commissionIds.length,
      paidAt,
      label: `Direct payout ${formatCurrency(amount)} · ${formatAppDate(paidAt)}`,
      commissionIds,
    };
  }

  const batch = await prisma.payoutBatch.findFirst({
    where: {
      id: ref.batchId,
      status: PAID_STATUS,
      ledgerEntries: {
        some: {
          affiliateId: memberAffiliateId,
          type: LedgerEntryType.DIRECT,
        },
      },
    },
    select: {
      id: true,
      processedAt: true,
      createdAt: true,
      items: {
        where: { affiliateId: memberAffiliateId },
        select: { totalAmount: true, entryCount: true },
      },
    },
  });
  if (!batch) return null;

  const item = batch.items[0];
  const paidAt = batch.processedAt ?? batch.createdAt;
  const amount = item ? toNumber(item.totalAmount) : 0;
  const entryCount = item?.entryCount ?? commissionIds.length;

  return {
    source: "platform",
    batchId: batch.id,
    memberAffiliateId,
    amount,
    entryCount,
    paidAt,
    label: `Direct payout ${formatCurrency(amount)} · ${formatAppDate(paidAt)}`,
    commissionIds,
  };
}

/** Paid direct receipts for a recruit, newest first. */
export async function listDirectPayoutAnchorsForMember(
  memberAffiliateId: string,
  limit = 24
): Promise<DirectPayoutAnchor[]> {
  const [slicewpPayments, platformBatches] = await Promise.all([
    prisma.slicewpPayment.findMany({
      where: { affiliateId: memberAffiliateId, status: PAID_SLICEWP },
      orderBy: [{ dateCreated: "desc" }, { slicewpPaymentId: "desc" }],
      take: limit,
      select: {
        id: true,
        amount: true,
        commissionIds: true,
        dateCreated: true,
        dateModified: true,
      },
    }),
    prisma.payoutBatch.findMany({
      where: {
        status: PAID_STATUS,
        ledgerEntries: {
          some: {
            affiliateId: memberAffiliateId,
            type: LedgerEntryType.DIRECT,
          },
        },
      },
      orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        processedAt: true,
        createdAt: true,
        items: {
          where: { affiliateId: memberAffiliateId },
          select: { totalAmount: true, entryCount: true },
        },
      },
    }),
  ]);

  const slicewpAnchors = await Promise.all(
    slicewpPayments.map(async (payment) => {
      const ref: DirectPayoutRef = {
        source: "slicewp",
        paymentId: payment.id,
      };
      return loadDirectPayoutAnchor(ref, memberAffiliateId);
    })
  );

  const platformAnchors = await Promise.all(
    platformBatches.map(async (batch) => {
      const ref: DirectPayoutRef = {
        source: "platform",
        batchId: batch.id,
      };
      return loadDirectPayoutAnchor(ref, memberAffiliateId);
    })
  );

  return [...slicewpAnchors, ...platformAnchors]
    .filter((anchor): anchor is DirectPayoutAnchor => anchor != null)
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
}

/** Commission ids already covered by any paid direct receipt for this recruit. */
export async function coveredSourceCommissionIds(
  memberAffiliateId: string
): Promise<Set<string>> {
  const anchors = await listDirectPayoutAnchorsForMember(memberAffiliateId, 100);
  const ids = new Set<string>();
  for (const anchor of anchors) {
    for (const id of anchor.commissionIds) ids.add(id);
  }
  return ids;
}

export async function loadDirectPayoutLabel(
  ref: DirectPayoutRef,
  memberAffiliateId: string
): Promise<string | null> {
  const anchor = await loadDirectPayoutAnchor(ref, memberAffiliateId);
  return anchor?.label ?? null;
}
