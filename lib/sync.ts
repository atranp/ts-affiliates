import {
  completeSync,
  failSync,
  setSyncStep,
} from "./sync-state";
import { getSettings } from "./settings";
import {
  fetchAllSliceWPAffiliates,
  fetchAllSliceWPCommissionsSince,
  mapSliceWPCommissionStatus,
  mapSliceWPStatus,
} from "./slicewp";
import { prisma } from "./prisma";
import { fetchWooOrderById } from "./woocommerce";
import { getRecruitRevenueMap } from "./admin/team";
import {
  linkOrphanRulesToDownlineTeams,
  syncTeamsFromSliceWP,
} from "./teams/slicewp-sync";
import {
  ensureDirectLedgerEntry,
  processDealRulesForCommission,
} from "./rules-engine";
import { toNumber } from "./utils";
import type { Affiliate, Commission } from "@prisma/client";

export type SyncResult = {
  affiliatesUpserted: number;
  commissionsUpserted: number;
  profilesLinked: number;
  overridesCreated: number;
  teamsSynced: number;
};

const COMMISSION_CHUNK_SIZE = 25;

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

  const syncedAt = new Date();
  const validRemotes = remoteAffiliates.flatMap((remote) => {
    const slicewpId = Number(remote.id);
    const email = (remote.email ?? remote.payment_email ?? "")
      .trim()
      .toLowerCase();
    if (!Number.isFinite(slicewpId) || !email) return [];

    const displayName = [remote.first_name, remote.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    return [{ remote, slicewpId, email, displayName }];
  });

  for (let i = 0; i < validRemotes.length; i += COMMISSION_CHUNK_SIZE) {
    const chunk = validRemotes.slice(i, i + COMMISSION_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map(({ slicewpId, email, displayName, remote }) =>
        prisma.affiliate.upsert({
          where: { slicewpId },
          update: {
            email,
            paymentEmail: remote.payment_email ?? null,
            displayName: displayName || null,
            status: mapSliceWPStatus(remote.status),
            commissionRate: remote.commission_rate
              ? toNumber(remote.commission_rate)
              : null,
            syncedAt,
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
            syncedAt,
          },
        })
      )
    );
  }

  const count = validRemotes.length;

  await linkAffiliateParents(validRemotes);

  await prisma.settings.upsert({
    where: { id: "default" },
    update: { lastAffiliateSyncAt: syncedAt },
    create: { id: "default", lastAffiliateSyncAt: syncedAt },
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

function getParentSlicewpId(
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

  for (const { remote, slicewpId } of validRemotes) {
    const parentSlicewpId = getParentSlicewpId(remote);
    const parentAffiliateId = parentSlicewpId
      ? bySlicewpId.get(parentSlicewpId)
      : undefined;

    await prisma.affiliate.update({
      where: { slicewpId },
      data: {
        parentSlicewpId: parentSlicewpId ?? null,
        parentAffiliateId: parentAffiliateId ?? null,
      },
    });
  }
}

async function resolveOrderRevenue(
  wooOrderId: number,
  existingRevenue: number | null | undefined,
  settings: Awaited<ReturnType<typeof getSettings>>,
  wooCache: Map<number, number | null>
): Promise<number | null> {
  if (existingRevenue != null) return existingRevenue;

  if (wooCache.has(wooOrderId)) {
    return wooCache.get(wooOrderId) ?? null;
  }

  let orderRevenue: number | null = null;
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

  wooCache.set(wooOrderId, orderRevenue);
  return orderRevenue;
}

async function upsertRemoteCommission(
  remote: Awaited<ReturnType<typeof fetchAllSliceWPCommissionsSince>>[number],
  affiliate: Affiliate,
  settings: Awaited<ReturnType<typeof getSettings>>,
  wooCache: Map<number, number | null>,
  existingBySlicewpId: Map<number, Commission>
): Promise<Commission | null> {
  const slicewpId = Number(remote.id);
  if (!Number.isFinite(slicewpId)) return null;

  const wooOrderId = remote.reference ? Number(remote.reference) : null;
  const existing = existingBySlicewpId.get(slicewpId);

  let orderRevenue: number | null = existing?.orderRevenue
    ? toNumber(existing.orderRevenue)
    : null;

  if (
    wooOrderId &&
    Number.isFinite(wooOrderId) &&
    orderRevenue == null
  ) {
    orderRevenue = await resolveOrderRevenue(
      wooOrderId,
      null,
      settings,
      wooCache
    );
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

  existingBySlicewpId.set(slicewpId, commission);
  return commission;
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

  const affiliateBySlicewpId = new Map(
    (await prisma.affiliate.findMany()).map((affiliate) => [
      affiliate.slicewpId,
      affiliate,
    ])
  );

  const remoteSlicewpIds = remoteCommissions
    .map((remote) => Number(remote.id))
    .filter((id) => Number.isFinite(id));

  const existingCommissions = remoteSlicewpIds.length
    ? await prisma.commission.findMany({
        where: { slicewpId: { in: remoteSlicewpIds } },
      })
    : [];

  const existingBySlicewpId = new Map(
    existingCommissions.map((commission) => [
      commission.slicewpId,
      commission,
    ])
  );

  const wooCache = new Map<number, number | null>();
  let count = 0;

  const activeSourceIds = Array.from(
    new Set(
      (
        await prisma.dealRule.findMany({
          where: { active: true, sourceAffiliateId: { not: null } },
          select: { sourceAffiliateId: true },
        })
      )
        .map((rule) => rule.sourceAffiliateId)
        .filter((id): id is string => !!id)
    )
  );
  const revenueByRecruit = await getRecruitRevenueMap(activeSourceIds);

  for (let i = 0; i < remoteCommissions.length; i += COMMISSION_CHUNK_SIZE) {
    const chunk = remoteCommissions.slice(i, i + COMMISSION_CHUNK_SIZE);

    const commissions = (
      await Promise.all(
        chunk.map(async (remote) => {
          const affiliateSlicewpId = Number(remote.affiliate_id);
          if (!Number.isFinite(affiliateSlicewpId)) return null;

          const affiliate = affiliateBySlicewpId.get(affiliateSlicewpId);
          if (!affiliate) return null;

          return upsertRemoteCommission(
            remote,
            affiliate,
            settings,
            wooCache,
            existingBySlicewpId
          );
        })
      )
    ).filter((commission): commission is Commission => !!commission);

    for (const commission of commissions) {
      await ensureDirectLedgerEntry(commission);
      await processDealRulesForCommission(commission, revenueByRecruit);
      if (commission.orderRevenue != null) {
        const current = revenueByRecruit.get(commission.affiliateId) ?? 0;
        revenueByRecruit.set(
          commission.affiliateId,
          current + toNumber(commission.orderRevenue)
        );
      }
      count += 1;
    }
  }

  const syncedAt = new Date();
  await prisma.settings.upsert({
    where: { id: "default" },
    update: { lastCommissionSyncAt: syncedAt },
    create: { id: "default", lastCommissionSyncAt: syncedAt },
  });

  await prisma.syncLog.create({
    data: {
      type: "commissions",
      status: "success",
      message: `Synced ${count} commissions`,
      metadata: { count, wooFetches: wooCache.size },
    },
  });

  return count;
}

export async function runFullSync(): Promise<SyncResult> {
  const affiliatesUpserted = await syncAffiliatesFromSliceWP();
  const teamsSynced = await syncTeamsFromSliceWP();
  await linkOrphanRulesToDownlineTeams();
  await setSyncStep("profiles");
  const profilesLinked = await autoLinkUnlinkedProfiles();
  await setSyncStep("commissions");
  const commissionsUpserted = await syncCommissionsFromSliceWP();

  const overridesCreated = await prisma.ledgerEntry.count({
    where: { type: "OVERRIDE" },
  });

  return {
    affiliatesUpserted,
    commissionsUpserted,
    profilesLinked,
    overridesCreated,
    teamsSynced,
  };
}

export async function runFullSyncJob() {
  try {
    const result = await runFullSync();
    await completeSync(result);
  } catch (error) {
    await failSync(error);
    throw error;
  }
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
    select: { id: true, email: true },
  });

  if (profiles.length === 0) return 0;

  const emails = profiles.map((profile) => profile.email.toLowerCase());
  const affiliates = await prisma.affiliate.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });

  const affiliateByEmail = new Map(
    affiliates.map((affiliate) => [affiliate.email.toLowerCase(), affiliate.id])
  );

  let linked = 0;
  for (const profile of profiles) {
    const affiliateId = affiliateByEmail.get(profile.email.toLowerCase());
    if (!affiliateId) continue;

    await prisma.profile.update({
      where: { id: profile.id },
      data: { affiliateId },
    });
    linked += 1;
  }

  return linked;
}
