import { getSettings } from "../settings";
import {
  fetchAllSliceWPAffiliates,
  mapSliceWPStatus,
  type SliceWPAffiliate,
} from "../slicewp";
import { prisma } from "../prisma";
import { fetchWooCustomersByIds, type WooCustomer } from "../woocommerce";
import { toNumber } from "../utils";
import { COMMISSION_CHUNK_SIZE } from "./constants";

type ValidRemoteAffiliate = {
  remote: SliceWPAffiliate;
  slicewpId: number;
  email: string;
  paymentEmail: string | null;
  displayName: string;
};

/** SliceWP itself returns no names, so fall back to the WordPress account. */
function resolveDisplayName(
  remote: SliceWPAffiliate,
  customer?: WooCustomer
): string {
  const candidates: Array<[string | undefined, string | undefined]> = [
    [remote.first_name, remote.last_name],
    [customer?.first_name, customer?.last_name],
    [customer?.billing?.first_name, customer?.billing?.last_name],
  ];

  for (const [first, last] of candidates) {
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (name) return name;
  }
  return "";
}

/**
 * SliceWP rows without an id or any usable email are unusable. The linked
 * WordPress account is the last resort — affiliates that never set a payment
 * email were previously dropped from the sync entirely.
 */
export function toValidAffiliate(
  remote: SliceWPAffiliate,
  customer?: WooCustomer
): ValidRemoteAffiliate | null {
  const slicewpId = Number(remote.id);

  // SliceWP sends "" rather than omitting the field, so `??` is not enough.
  const email = firstNonEmpty(
    remote.email,
    remote.payment_email,
    customer?.email
  ).toLowerCase();
  if (!Number.isFinite(slicewpId) || !email) return null;

  return {
    remote,
    slicewpId,
    email,
    paymentEmail: firstNonEmpty(remote.payment_email) || null,
    displayName: resolveDisplayName(remote, customer),
  };
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function affiliateUserIds(remotes: SliceWPAffiliate[]): number[] {
  return remotes
    .map((remote) => Number(remote.user_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export function upsertAffiliate(
  { remote, slicewpId, email, paymentEmail, displayName }: ValidRemoteAffiliate,
  syncedAt: Date
) {
  const fields = {
    email,
    paymentEmail,
    website: firstNonEmpty(remote.website) || null,
    status: mapSliceWPStatus(remote.status),
    commissionRate: remote.commission_rate
      ? toNumber(remote.commission_rate)
      : null,
    syncedAt,
  };

  return prisma.affiliate.upsert({
    where: { slicewpId },
    // Names come from a separate WordPress lookup that is allowed to fail.
    // Leave the stored name alone rather than blanking it when it does.
    update: displayName ? { ...fields, displayName } : fields,
    create: { slicewpId, ...fields, displayName: displayName || null },
  });
}

/**
 * Marks affiliates INACTIVE once SliceWP no longer has them.
 *
 * Upserts only touch affiliates the fetch returned, so a deleted affiliate
 * silently kept whatever status it last had — including ACTIVE, with a stale
 * unpaid balance nobody upstream would ever settle.
 *
 * The row itself is kept: payout history and past commissions still reference
 * it, so deleting it would erase records of money that really was paid.
 *
 * Only safe against a complete fetch, for the same reason as the commission
 * prune.
 */
async function deactivateAffiliatesMissingFromSliceWP(
  remoteAffiliates: SliceWPAffiliate[]
): Promise<number> {
  // One affiliate is a plausible store; zero means the fetch failed.
  if (remoteAffiliates.length === 0) return 0;

  const remoteIds = remoteAffiliates
    .map((remote) => Number(remote.id))
    .filter((id) => Number.isFinite(id));
  if (remoteIds.length === 0) return 0;

  const result = await prisma.affiliate.updateMany({
    where: {
      slicewpId: { notIn: remoteIds },
      status: { not: "INACTIVE" },
    },
    data: { status: "INACTIVE" },
  });

  return result.count;
}

export async function syncAffiliatesFromSliceWP(): Promise<number> {
  const settings = await getSettings();
  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    throw new Error("SliceWP credentials are not configured");
  }

  const remoteAffiliates = await fetchAllSliceWPAffiliates(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret
  );

  const customers = await fetchWooCustomersByIds(
    settings.wcStoreUrl,
    settings.wcConsumerKey,
    settings.wcConsumerSecret,
    affiliateUserIds(remoteAffiliates)
  );

  const syncedAt = new Date();
  const validRemotes = remoteAffiliates.flatMap((remote) => {
    const valid = toValidAffiliate(
      remote,
      customers.get(Number(remote.user_id))
    );
    return valid ? [valid] : [];
  });

  for (let i = 0; i < validRemotes.length; i += COMMISSION_CHUNK_SIZE) {
    const chunk = validRemotes.slice(i, i + COMMISSION_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((valid) => upsertAffiliate(valid, syncedAt))
    );
  }

  const count = validRemotes.length;

  await linkAffiliateParents(validRemotes);

  const deactivated = await deactivateAffiliatesMissingFromSliceWP(
    remoteAffiliates
  );

  await prisma.settings.upsert({
    where: { id: "default" },
    update: { lastAffiliateSyncAt: syncedAt },
    create: { id: "default", lastAffiliateSyncAt: syncedAt },
  });

  await prisma.syncLog.create({
    data: {
      type: "affiliates",
      status: "success",
      message:
        deactivated > 0
          ? `Synced ${count} affiliates, deactivated ${deactivated} removed from SliceWP`
          : `Synced ${count} affiliates`,
      metadata: { count, deactivated },
    },
  });

  return count;
}

export function getParentSlicewpId(
  remote: Awaited<
    ReturnType<typeof fetchAllSliceWPAffiliates>
  >[number]
): number | null {
  const raw = remote.parent_id ?? remote.parent_affiliate_id;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

async function linkAffiliateParents(
  validRemotes: Array<{
    remote: Awaited<ReturnType<typeof fetchAllSliceWPAffiliates>>[number];
    slicewpId: number;
  }>
) {
  const affiliates = await prisma.affiliate.findMany({
    select: { id: true, slicewpId: true },
  });
  const bySlicewpId = new Map(
    affiliates.map((affiliate) => [affiliate.slicewpId, affiliate.id])
  );

  const updates = validRemotes.map(({ remote, slicewpId }) => {
    const parentSlicewpId = getParentSlicewpId(remote);
    const parentAffiliateId = parentSlicewpId
      ? bySlicewpId.get(parentSlicewpId)
      : undefined;

    return prisma.affiliate.update({
      where: { slicewpId },
      data: {
        parentSlicewpId: parentSlicewpId ?? null,
        parentAffiliateId: parentAffiliateId ?? null,
      },
    });
  });

  for (let i = 0; i < updates.length; i += COMMISSION_CHUNK_SIZE) {
    await prisma.$transaction(updates.slice(i, i + COMMISSION_CHUNK_SIZE));
  }
}

export async function relinkAffiliateParent(
  affiliateId: string,
  parentSlicewpId: number | null
) {
  const parent = parentSlicewpId
    ? await prisma.affiliate.findUnique({
        where: { slicewpId: parentSlicewpId },
        select: { id: true },
      })
    : null;

  await prisma.affiliate.update({
    where: { id: affiliateId },
    data: {
      parentSlicewpId: parentSlicewpId ?? null,
      parentAffiliateId: parent?.id ?? null,
    },
  });
}
