import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  fetchAllSliceWPPayments,
  fetchSliceWPPaymentsForAffiliates,
  parseSliceWPCommissionIds,
  type SliceWPPayment,
} from "@/lib/slicewp";
import { toNumber } from "@/lib/utils";

/** Rows per transaction. Payments are far rarer than commissions. */
const PAYMENT_CHUNK_SIZE = 200;

export type SlicewpPaymentSyncResult = {
  upserted: number;
  removed: number;
};

type PreparedPayment = {
  slicewpPaymentId: number;
  slicewpPayoutId: number | null;
  affiliateId: string;
  amount: number;
  currency: string | null;
  status: string;
  payoutMethod: string | null;
  commissionIds: number[];
  dateCreated: Date;
  dateModified: Date | null;
};

/**
 * The REST API add-on gained `/payments/` later than `/commissions/`, so a
 * store on an older build answers with a routing error rather than data.
 * That is a missing feature, not a broken sync.
 */
export function isMissingPaymentsEndpoint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rest_no_route|404/.test(message);
}

function optionalString(value?: string): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  // SliceWP writes MySQL GMT datetimes with a space separator, which Safari
  // and Node parse inconsistently unless it is spelled as ISO UTC.
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function prepare(
  remote: SliceWPPayment,
  affiliateBySlicewpId: Map<number, string>
): PreparedPayment | null {
  const slicewpPaymentId = Number(remote.id);
  const affiliateId = affiliateBySlicewpId.get(Number(remote.affiliate_id));
  if (!Number.isFinite(slicewpPaymentId) || !affiliateId) return null;

  const payoutId = Number(remote.payout_id);

  return {
    slicewpPaymentId,
    slicewpPayoutId: Number.isFinite(payoutId) && payoutId > 0 ? payoutId : null,
    affiliateId,
    amount: toNumber(remote.amount),
    currency: optionalString(remote.currency),
    status: (remote.status ?? "unpaid").toLowerCase(),
    payoutMethod: optionalString(remote.payout_method),
    commissionIds: parseSliceWPCommissionIds(remote.commission_ids),
    dateCreated: parseDate(remote.date_created) ?? new Date(),
    dateModified: parseDate(remote.date_modified),
  };
}

async function persist(
  prepared: PreparedPayment[],
  syncedAt: Date
): Promise<number> {
  for (let i = 0; i < prepared.length; i += PAYMENT_CHUNK_SIZE) {
    const chunk = prepared.slice(i, i + PAYMENT_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map(({ slicewpPaymentId, ...fields }) =>
        prisma.slicewpPayment.upsert({
          where: { slicewpPaymentId },
          update: { ...fields, syncedAt },
          create: { slicewpPaymentId, ...fields, syncedAt },
        })
      )
    );
  }
  return prepared.length;
}

/**
 * Mirrors SliceWP's payment records so payouts made in WordPress show up
 * alongside the ones recorded here. Read-only with respect to the ledger:
 * commissions paid in SliceWP already arrive with a PAID status, so the
 * entries these receipts itemise are settled either way.
 */
export async function syncSlicewpPayments(options?: {
  /** Limits both the fetch and the stale-row cleanup to these affiliates. */
  affiliateIds?: string[];
}): Promise<SlicewpPaymentSyncResult> {
  const settings = await getSettings();
  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    throw new Error("SliceWP credentials are not configured");
  }

  const affiliates = await prisma.affiliate.findMany({
    where: options?.affiliateIds ? { id: { in: options.affiliateIds } } : undefined,
    select: { id: true, slicewpId: true },
  });

  if (options?.affiliateIds && affiliates.length === 0) {
    return { upserted: 0, removed: 0 };
  }

  const remotePayments = options?.affiliateIds
    ? await fetchSliceWPPaymentsForAffiliates(
        settings.wcStoreUrl,
        settings.slicewpConsumerKey,
        settings.slicewpConsumerSecret,
        affiliates.map((affiliate) => affiliate.slicewpId)
      )
    : await fetchAllSliceWPPayments(
        settings.wcStoreUrl,
        settings.slicewpConsumerKey,
        settings.slicewpConsumerSecret
      );

  // Cleanup below is scoped to the affiliates that were actually fetched, so
  // resolving ids against everyone would let a payment survive on a mismatch.
  const affiliateBySlicewpId = new Map(
    affiliates.map((affiliate) => [affiliate.slicewpId, affiliate.id])
  );

  const prepared = remotePayments.flatMap((remote) => {
    const row = prepare(remote, affiliateBySlicewpId);
    return row ? [row] : [];
  });

  const syncedAt = new Date();
  const upserted = await persist(prepared, syncedAt);

  // A payout deleted in WordPress should stop showing as a receipt here.
  const { count: removed } = await prisma.slicewpPayment.deleteMany({
    where: {
      slicewpPaymentId: {
        notIn: prepared.map((row) => row.slicewpPaymentId),
      },
      ...(options?.affiliateIds
        ? { affiliateId: { in: affiliates.map((affiliate) => affiliate.id) } }
        : {}),
    },
  });

  return { upserted, removed };
}
