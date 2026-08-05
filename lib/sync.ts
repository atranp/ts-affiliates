import {
  completeSync,
  failSync,
  formatSyncError,
  setSyncStep,
} from "./sync-state";
import { getSettings } from "./settings";
import {
  fetchAllSliceWPAffiliates,
  fetchAllSliceWPCommissions,
  fetchSliceWPAffiliateById,
  fetchSliceWPCommissionsForAffiliates,
  mapSliceWPCommissionStatus,
  mapSliceWPStatus,
  type SliceWPAffiliate,
  type SliceWPCommission,
} from "./slicewp";
import { prisma } from "./prisma";
import { getRecruitRevenueMap } from "./admin/team";
import { ensureSponsorDownlineTeam } from "./teams/members";
import {
  linkOrphanRulesToDownlineTeams,
  syncTeamsFromSliceWP,
} from "./teams/slicewp-sync";
import { createSyncDealRuleProcessor } from "./rules-engine";
import {
  bulkUpsertCommissions,
  syncDirectLedgerEntries,
  type CommissionUpsertRow,
} from "./sync-write";
import { toNumber } from "./utils";

export type SyncResult = {
  affiliatesUpserted: number;
  commissionsUpserted: number;
  profilesLinked: number;
  overridesCreated: number;
  teamsSynced: number;
};

/** Rows per bulk statement. Larger chunks mean fewer round-trips. */
const COMMISSION_CHUNK_SIZE = 500;

type ValidRemoteAffiliate = {
  remote: SliceWPAffiliate;
  slicewpId: number;
  email: string;
  displayName: string;
};

/** SliceWP rows without an id or any usable email address are unusable. */
function toValidAffiliate(
  remote: SliceWPAffiliate
): ValidRemoteAffiliate | null {
  const slicewpId = Number(remote.id);
  const email = (remote.email ?? remote.payment_email ?? "")
    .trim()
    .toLowerCase();
  if (!Number.isFinite(slicewpId) || !email) return null;

  const displayName = [remote.first_name, remote.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return { remote, slicewpId, email, displayName };
}

function upsertAffiliate(
  { remote, slicewpId, email, displayName }: ValidRemoteAffiliate,
  syncedAt: Date
) {
  const fields = {
    email,
    paymentEmail: remote.payment_email ?? null,
    displayName: displayName || null,
    status: mapSliceWPStatus(remote.status),
    commissionRate: remote.commission_rate
      ? toNumber(remote.commission_rate)
      : null,
    syncedAt,
  };

  return prisma.affiliate.upsert({
    where: { slicewpId },
    update: fields,
    create: { slicewpId, ...fields },
  });
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

  const syncedAt = new Date();
  const validRemotes = remoteAffiliates.flatMap((remote) => {
    const valid = toValidAffiliate(remote);
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

function buildCommissionData(
  remote: SliceWPCommission,
  affiliateId: string
): CommissionUpsertRow | null {
  const slicewpId = Number(remote.id);
  if (!Number.isFinite(slicewpId)) return null;

  const wooOrderId = remote.reference ? Number(remote.reference) : null;

  // SliceWP reports the order total it calculated against, so there is no
  // need to hit WooCommerce per order. Tier-2 "inherit" rows report 0, which
  // keeps their revenue from being double counted against the sale row.
  const referenceAmount =
    remote.reference_amount != null && remote.reference_amount !== ""
      ? toNumber(remote.reference_amount)
      : null;

  return {
    slicewpId,
    affiliateId,
    wooOrderId: wooOrderId && Number.isFinite(wooOrderId) ? wooOrderId : null,
    amount: toNumber(remote.amount),
    orderRevenue: referenceAmount,
    status: mapSliceWPCommissionStatus(remote.status),
    type: remote.type ?? null,
    origin: remote.origin ?? null,
    parentSlicewpId: remote.parent_id ? Number(remote.parent_id) : null,
    dateCreated: remote.date_created
      ? new Date(remote.date_created)
      : new Date(),
  };
}

/**
 * Shared by the full and per-affiliate syncs. Expects `remoteCommissions`
 * oldest-first. Cost is a fixed handful of round-trips per chunk rather than
 * a few per commission, which is what previously blew the serverless limit.
 */
async function persistRemoteCommissions(
  remoteCommissions: SliceWPCommission[]
): Promise<number> {
  if (remoteCommissions.length === 0) return 0;

  const affiliates = await prisma.affiliate.findMany({
    select: { id: true, slicewpId: true, displayName: true, email: true },
  });
  const affiliateBySlicewpId = new Map(
    affiliates.map((affiliate) => [affiliate.slicewpId, affiliate])
  );
  const affiliateNames = new Map(
    affiliates.map((affiliate) => [
      affiliate.id,
      affiliate.displayName ?? affiliate.email,
    ])
  );

  const dealRuleProcessor = await createSyncDealRuleProcessor();
  const activeSourceIds = (
    await prisma.dealRule.findMany({
      where: { active: true, sourceAffiliateId: { not: null } },
      select: { sourceAffiliateId: true },
    })
  )
    .map((rule) => rule.sourceAffiliateId)
    .filter((id): id is string => !!id);

  const revenueByRecruit = await getRecruitRevenueMap(
    Array.from(new Set([...activeSourceIds, ...dealRuleProcessor.teamMemberIds]))
  );

  // Revenue re-accrues from the batch below, and a batch always contains every
  // commission for the affiliates it touches. Without this reset their stored
  // totals would be counted a second time and unlock milestones too early.
  for (const remote of remoteCommissions) {
    const affiliate = affiliateBySlicewpId.get(Number(remote.affiliate_id));
    if (affiliate && revenueByRecruit.has(affiliate.id)) {
      revenueByRecruit.set(affiliate.id, 0);
    }
  }

  const syncedAt = new Date();
  const touchedAffiliateIds = new Set<string>();
  let count = 0;

  for (let i = 0; i < remoteCommissions.length; i += COMMISSION_CHUNK_SIZE) {
    const rows = remoteCommissions
      .slice(i, i + COMMISSION_CHUNK_SIZE)
      .flatMap((remote) => {
        const affiliate = affiliateBySlicewpId.get(Number(remote.affiliate_id));
        if (!affiliate) return [];

        const data = buildCommissionData(remote, affiliate.id);
        return data ? [data] : [];
      });

    if (rows.length === 0) continue;

    const commissions = await bulkUpsertCommissions(rows, syncedAt);
    for (const commission of commissions) {
      touchedAffiliateIds.add(commission.affiliateId);
    }

    await dealRuleProcessor.processBatch(
      commissions,
      revenueByRecruit,
      affiliateNames
    );

    count += commissions.length;
  }

  await dealRuleProcessor.flushMilestonePromotions(revenueByRecruit);

  // Derived in SQL from the commissions above, so this is a fixed cost
  // rather than one that scales with the number of rows synced.
  await syncDirectLedgerEntries(Array.from(touchedAffiliateIds));

  return count;
}

export async function syncCommissionsFromSliceWP(): Promise<number> {
  const settings = await getSettings();
  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    throw new Error("SliceWP credentials are not configured");
  }

  // Deliberately unfiltered: the previous `since` watermark was only written
  // after a full pass, so a single timeout meant it was never written and
  // every run restarted from zero. Re-reading everything also picks up status
  // changes on older commissions.
  const remoteCommissions = await fetchAllSliceWPCommissions(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret
  );

  const count = await persistRemoteCommissions(remoteCommissions);

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
      metadata: { count, fetched: remoteCommissions.length },
    },
  });

  return count;
}

export type AffiliateSyncResult = {
  affiliateId: string;
  slicewpId: number;
  displayName: string | null;
  recruitsIncluded: number;
  commissionsUpserted: number;
};

/**
 * Refreshes one affiliate plus their direct recruits, without touching the
 * rest of the base. Recruit commissions are included because the sponsor's
 * team bonuses are derived from them.
 *
 * Runs independently of the global sync lock — it only writes rows belonging
 * to these affiliates, and upserts are idempotent.
 */
export async function syncAffiliate(
  affiliateId: string
): Promise<AffiliateSyncResult> {
  const settings = await getSettings();
  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    throw new Error("SliceWP credentials are not configured");
  }

  const existing = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { id: true, slicewpId: true },
  });
  if (!existing) {
    throw new Error("Affiliate not found");
  }

  const remote = await fetchSliceWPAffiliateById(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
    existing.slicewpId
  );
  if (!remote) {
    throw new Error(
      `SliceWP has no affiliate ${existing.slicewpId} — it may have been deleted.`
    );
  }

  const valid = toValidAffiliate(remote);
  if (!valid) {
    throw new Error(
      `SliceWP affiliate ${existing.slicewpId} has no email address to sync.`
    );
  }

  const affiliate = await upsertAffiliate(valid, new Date());
  await relinkAffiliateParent(affiliate.id, getParentSlicewpId(remote));

  const recruits = await prisma.affiliate.findMany({
    where: { parentAffiliateId: affiliate.id },
    select: { slicewpId: true },
  });

  if (recruits.length > 0) {
    await ensureSponsorDownlineTeam(affiliate.id);
  }

  const remoteCommissions = await fetchSliceWPCommissionsForAffiliates(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
    [affiliate.slicewpId, ...recruits.map((recruit) => recruit.slicewpId)]
  );

  const commissionsUpserted = await persistRemoteCommissions(remoteCommissions);

  await prisma.syncLog.create({
    data: {
      type: "affiliate",
      status: "success",
      message: `Synced ${affiliate.displayName ?? affiliate.email} (${commissionsUpserted} commissions)`,
      metadata: {
        affiliateId: affiliate.id,
        slicewpId: affiliate.slicewpId,
        recruitsIncluded: recruits.length,
        commissionsUpserted,
      },
    },
  });

  return {
    affiliateId: affiliate.id,
    slicewpId: affiliate.slicewpId,
    displayName: affiliate.displayName,
    recruitsIncluded: recruits.length,
    commissionsUpserted,
  };
}

async function relinkAffiliateParent(
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

export async function runFullSync(): Promise<SyncResult> {
  await setSyncStep("affiliates");
  const affiliatesUpserted = await syncAffiliatesFromSliceWP();

  let teamsSynced = 0;
  try {
    teamsSynced = await syncTeamsFromSliceWP();
    await linkOrphanRulesToDownlineTeams();
  } catch (error) {
    const message = formatSyncError(error);
    if (/slicewpKey|column.*Team|Unknown field/i.test(message)) {
      throw new Error(
        `Team sync failed — production database needs migration (npm run db:push). Details: ${message}`
      );
    }
    throw error;
  }

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
  const linkUpdates = [];
  for (const profile of profiles) {
    const affiliateId = affiliateByEmail.get(profile.email.toLowerCase());
    if (!affiliateId) continue;

    linkUpdates.push(
      prisma.profile.update({
        where: { id: profile.id },
        data: { affiliateId },
      })
    );
    linked += 1;
  }

  for (let i = 0; i < linkUpdates.length; i += COMMISSION_CHUNK_SIZE) {
    await prisma.$transaction(linkUpdates.slice(i, i + COMMISSION_CHUNK_SIZE));
  }

  return linked;
}
