import { prisma } from "./prisma";
import { getSettings } from "./settings";
import {
  fetchAllSliceWPAffiliates,
  fetchAllSliceWPCommissionsSince,
  mapSliceWPCommissionStatus,
  mapSliceWPStatus,
} from "./slicewp";
import { fetchWooOrderById } from "./woocommerce";
import {
  ensureDirectLedgerEntry,
  processDealRulesForCommission,
} from "./rules-engine";
import { toNumber } from "./utils";

export type SyncResult = {
  affiliatesUpserted: number;
  commissionsUpserted: number;
  profilesLinked: number;
  overridesCreated: number;
};

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

  let count = 0;
  for (const remote of remoteAffiliates) {
    const slicewpId = Number(remote.id);
    if (!Number.isFinite(slicewpId)) continue;

    const email = (remote.email ?? remote.payment_email ?? "").trim().toLowerCase();
    if (!email) continue;

    const displayName = [remote.first_name, remote.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    await prisma.affiliate.upsert({
      where: { slicewpId },
      update: {
        email,
        paymentEmail: remote.payment_email ?? null,
        displayName: displayName || null,
        status: mapSliceWPStatus(remote.status),
        commissionRate: remote.commission_rate
          ? toNumber(remote.commission_rate)
          : null,
        syncedAt: new Date(),
      },
      create: {
        slicewpId,
        email,
        paymentEmail: remote.payment_email ?? null,
        displayName: displayName || null,
        status: mapSliceWPStatus(remote.status),
        commissionRate: remote.commission_rate
          ? toNumber(remote.commission_rate)
          : null,
        syncedAt: new Date(),
      },
    });
    count += 1;
  }

  await prisma.settings.upsert({
    where: { id: "default" },
    update: { lastAffiliateSyncAt: new Date() },
    create: { id: "default", lastAffiliateSyncAt: new Date() },
  });

  await prisma.syncLog.create({
    data: {
      type: "affiliates",
      status: "success",
      message: `Synced ${count} affiliates`,
      metadata: { count },
    },
  });

  return count;
}

export async function syncCommissionsFromSliceWP(): Promise<number> {
  const settings = await getSettings();
  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    throw new Error("SliceWP credentials are not configured");
  }

  const since = settings.lastCommissionSyncAt ?? undefined;
  const remoteCommissions = await fetchAllSliceWPCommissionsSince(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
    since
  );

  let count = 0;
  for (const remote of remoteCommissions) {
    const slicewpId = Number(remote.id);
    const affiliateSlicewpId = Number(remote.affiliate_id);
    if (!Number.isFinite(slicewpId) || !Number.isFinite(affiliateSlicewpId)) {
      continue;
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { slicewpId: affiliateSlicewpId },
    });
    if (!affiliate) continue;

    const wooOrderId = remote.reference ? Number(remote.reference) : null;
    let orderRevenue: number | null = null;

    if (wooOrderId && Number.isFinite(wooOrderId)) {
      try {
        const order = await fetchWooOrderById(
          settings.wcStoreUrl,
          settings.wcConsumerKey,
          settings.wcConsumerSecret,
          wooOrderId
        );
        orderRevenue = order ? toNumber(order.total) : null;
      } catch {
        orderRevenue = null;
      }
    }

    const commission = await prisma.commission.upsert({
      where: { slicewpId },
      update: {
        affiliateId: affiliate.id,
        wooOrderId: wooOrderId && Number.isFinite(wooOrderId) ? wooOrderId : null,
        amount: toNumber(remote.amount),
        orderRevenue,
        status: mapSliceWPCommissionStatus(remote.status),
        type: remote.type ?? null,
        origin: remote.origin ?? null,
        parentSlicewpId: remote.parent_id ? Number(remote.parent_id) : null,
        dateCreated: remote.date_created
          ? new Date(remote.date_created)
          : new Date(),
        syncedAt: new Date(),
      },
      create: {
        slicewpId,
        affiliateId: affiliate.id,
        wooOrderId: wooOrderId && Number.isFinite(wooOrderId) ? wooOrderId : null,
        amount: toNumber(remote.amount),
        orderRevenue,
        status: mapSliceWPCommissionStatus(remote.status),
        type: remote.type ?? null,
        origin: remote.origin ?? null,
        parentSlicewpId: remote.parent_id ? Number(remote.parent_id) : null,
        dateCreated: remote.date_created
          ? new Date(remote.date_created)
          : new Date(),
      },
    });

    await ensureDirectLedgerEntry(commission);
    await processDealRulesForCommission(commission);
    count += 1;
  }

  await prisma.settings.upsert({
    where: { id: "default" },
    update: { lastCommissionSyncAt: new Date() },
    create: { id: "default", lastCommissionSyncAt: new Date() },
  });

  await prisma.syncLog.create({
    data: {
      type: "commissions",
      status: "success",
      message: `Synced ${count} commissions`,
      metadata: { count },
    },
  });

  return count;
}

export async function runFullSync(): Promise<SyncResult> {
  const affiliatesUpserted = await syncAffiliatesFromSliceWP();
  const profilesLinked = await autoLinkUnlinkedProfiles();
  const commissionsUpserted = await syncCommissionsFromSliceWP();

  const overridesCreated = await prisma.ledgerEntry.count({
    where: { type: "OVERRIDE" },
  });

  return {
    affiliatesUpserted,
    commissionsUpserted,
    profilesLinked,
    overridesCreated,
  };
}

export async function linkProfileToAffiliateByEmail(
  profileId: string,
  email: string
): Promise<void> {
  const affiliate = await prisma.affiliate.findFirst({
    where: { email: email.toLowerCase() },
  });

  if (!affiliate) return;

  await prisma.profile.update({
    where: { id: profileId },
    data: { affiliateId: affiliate.id },
  });
}

export async function autoLinkUnlinkedProfiles(): Promise<number> {
  const profiles = await prisma.profile.findMany({
    where: {
      affiliateId: null,
      role: "AFFILIATE",
    },
  });

  let linked = 0;
  for (const profile of profiles) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { email: profile.email.toLowerCase() },
    });
    if (!affiliate) continue;

    await prisma.profile.update({
      where: { id: profile.id },
      data: { affiliateId: affiliate.id },
    });
    linked += 1;
  }

  return linked;
}
