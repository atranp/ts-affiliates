import type { Commission, SlicewpPayment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatAppDate } from "@/lib/timezone";
import { toNumber } from "@/lib/utils";
import { recruitBreakdownFromEntries } from "./shared";
import type {
  PayoutBatchDetail,
  PayoutBatchEntry,
  PayoutBatchListItem,
} from "./types";

/**
 * Only payments SliceWP has actually settled count as history. The others are
 * a payout drafted in WordPress where no money has moved yet.
 */
const PAID_STATUS = "paid";

type AffiliateRef = { id: string; displayName: string | null; email: string };

type CommissionWithAffiliate = Commission & { affiliate: AffiliateRef };

function affiliateName(affiliate: AffiliateRef): string {
  return affiliate.displayName ?? affiliate.email;
}

/** Mirrors the platform label shape. The source is carried by the badge. */
function buildLabel(payment: SlicewpPayment, affiliate: AffiliateRef): string {
  return `${affiliateName(affiliate)} · payout through ${formatAppDate(
    payment.dateCreated
  )}`;
}

/**
 * SliceWP's own tier-2 commission. We model the same bonus ourselves as an
 * OVERRIDE ledger entry and skip mirroring SliceWP's copy, but a SliceWP
 * receipt has to itemise exactly what SliceWP paid — including these.
 */
function isInherited(commission: Commission): boolean {
  return (commission.type ?? "").toLowerCase() === "inherit";
}

function toEntry(
  commission: CommissionWithAffiliate,
  parents: Map<number, CommissionWithAffiliate>
): PayoutBatchEntry {
  // An inherited commission credits the sponsor for a recruit's sale, and the
  // recruit is only reachable through the parent commission it was cloned from.
  const parent = commission.parentSlicewpId
    ? parents.get(commission.parentSlicewpId)
    : undefined;

  const wooOrderId = commission.wooOrderId ?? parent?.wooOrderId ?? null;
  // SliceWP reports 0 revenue on inherited rows so the sale is not counted
  // twice, which leaves the parent as the only place to read the sale value.
  const orderRevenue =
    toNumber(commission.orderRevenue) || toNumber(parent?.orderRevenue) || null;

  return {
    id: commission.id,
    type: isInherited(commission) ? "OVERRIDE" : "DIRECT",
    amount: toNumber(commission.amount),
    status: commission.status,
    description: wooOrderId ? `Order #${wooOrderId}` : "Direct commission",
    wooOrderId,
    orderRevenue,
    occurredAt: commission.dateCreated.toISOString(),
    sourceAffiliate: parent ? parent.affiliate : null,
    dealRule: null,
  };
}

async function loadEntries(
  commissionIds: number[]
): Promise<PayoutBatchEntry[]> {
  if (commissionIds.length === 0) return [];

  const commissions = await prisma.commission.findMany({
    where: { slicewpId: { in: commissionIds } },
    include: { affiliate: { select: { id: true, displayName: true, email: true } } },
    orderBy: [{ dateCreated: "desc" }, { id: "desc" }],
  });

  const parentIds = commissions
    .map((commission) => commission.parentSlicewpId)
    .filter((id): id is number => !!id);

  const parents = parentIds.length
    ? await prisma.commission.findMany({
        where: { slicewpId: { in: parentIds } },
        include: {
          affiliate: { select: { id: true, displayName: true, email: true } },
        },
      })
    : [];

  const parentsBySlicewpId = new Map(
    parents.map((parent) => [parent.slicewpId, parent])
  );

  return commissions.map((commission) =>
    toEntry(commission, parentsBySlicewpId)
  );
}

function splitTotals(entries: PayoutBatchEntry[]) {
  let directTotal = 0;
  let overrideTotal = 0;
  for (const entry of entries) {
    if (entry.type === "OVERRIDE") overrideTotal += entry.amount;
    else directTotal += entry.amount;
  }
  return { directTotal, overrideTotal };
}

function toListItem(
  payment: SlicewpPayment & { affiliate: AffiliateRef }
): PayoutBatchListItem {
  const processedAt = (payment.dateModified ?? payment.dateCreated).toISOString();

  return {
    id: payment.id,
    source: "SLICEWP",
    label: buildLabel(payment, payment.affiliate),
    status: "COMPLETED",
    periodStart: payment.dateCreated.toISOString(),
    periodEnd: processedAt,
    processedAt,
    createdAt: payment.dateCreated.toISOString(),
    teamId: null,
    teamName: null,
    // A SliceWP payout only ever concerns one affiliate, so they are both the
    // payee and the subject an admin would filter the history by.
    sponsorAffiliateId: payment.affiliateId,
    entryCount: payment.commissionIds.length,
    affiliateCount: 1,
    totalAmount: toNumber(payment.amount),
  };
}

const LIST_INCLUDE = {
  affiliate: { select: { id: true, displayName: true, email: true } },
} as const;

const LIST_ORDER = [
  { dateCreated: "desc" },
  { slicewpPaymentId: "desc" },
] as const;

export async function listSlicewpPayoutsForAffiliate(
  affiliateId: string,
  limit = 20
): Promise<PayoutBatchListItem[]> {
  const payments = await prisma.slicewpPayment.findMany({
    where: { affiliateId, status: PAID_STATUS },
    orderBy: [...LIST_ORDER],
    take: limit,
    include: LIST_INCLUDE,
  });

  return payments.map(toListItem);
}

export async function listSlicewpPayouts(
  limit = 20
): Promise<PayoutBatchListItem[]> {
  const payments = await prisma.slicewpPayment.findMany({
    where: { status: PAID_STATUS },
    orderBy: [...LIST_ORDER],
    take: limit,
    include: LIST_INCLUDE,
  });

  return payments.map(toListItem);
}

export async function getSlicewpPayoutDetail(
  id: string,
  options?: { affiliateId?: string }
): Promise<PayoutBatchDetail | null> {
  const payment = await prisma.slicewpPayment.findFirst({
    where: {
      id,
      status: PAID_STATUS,
      ...(options?.affiliateId ? { affiliateId: options.affiliateId } : {}),
    },
    include: {
      affiliate: { select: { id: true, displayName: true, email: true } },
    },
  });

  if (!payment) return null;

  const entries = await loadEntries(payment.commissionIds);
  const { directTotal, overrideTotal } = splitTotals(entries);
  // SliceWP's own figure is what the affiliate was actually sent, so it stays
  // the headline even if a commission behind it has yet to sync.
  const grandTotal = toNumber(payment.amount);
  const occurredAt = entries.map((entry) => entry.occurredAt).sort();
  const processedAt = (payment.dateModified ?? payment.dateCreated).toISOString();

  return {
    id: payment.id,
    source: "SLICEWP",
    label: buildLabel(payment, payment.affiliate),
    status: "COMPLETED",
    periodStart: occurredAt[0] ?? payment.dateCreated.toISOString(),
    periodEnd: occurredAt[occurredAt.length - 1] ?? processedAt,
    processedAt,
    createdAt: payment.dateCreated.toISOString(),
    teamId: null,
    teamName: null,
    sponsorAffiliateId: payment.affiliateId,
    payoutMethod: payment.payoutMethod,
    totals: {
      grandTotal,
      directTotal,
      overrideTotal,
      otherTotal: 0,
      entryCount: payment.commissionIds.length,
    },
    items: [
      {
        affiliateId: payment.affiliateId,
        displayName: payment.affiliate.displayName,
        email: payment.affiliate.email,
        totalAmount: grandTotal,
        entryCount: payment.commissionIds.length,
        directTotal,
        overrideTotal,
      },
    ],
    recruitBreakdown: recruitBreakdownFromEntries(entries),
    entries,
  };
}
