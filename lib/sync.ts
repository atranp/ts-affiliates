import { LedgerEntryType, Prisma } from "@prisma/client";
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
import { assertSyncTargetsAgree } from "./env-guard";
import { fetchWooCustomersByIds, type WooCustomer } from "./woocommerce";
import { getRecruitRevenueMap } from "./admin/team";
import { ensureSponsorDownlineTeam } from "./teams/members";
import {
  linkOrphanRulesToDownlineTeams,
  syncTeamsFromSliceWP,
} from "./teams/slicewp-sync";
import { createSyncDealRuleProcessor } from "./rules-engine";
import {
  isMissingPaymentsEndpoint,
  syncSlicewpPayments,
} from "./payouts/slicewp-sync";
import {
  bulkUpsertCommissions,
  syncCommissionBases,
  syncDirectLedgerEntries,
  syncLedgerCommissionBases,
  type CommissionUpsertRow,
} from "./sync-write";
import {
  syncAffiliateExtras,
  syncCreatives,
  syncVisits,
} from "./sync-parity";
import {
  enrichCommissionJourneyAfterSync,
  visitAndCustomerFromRemote,
} from "./sync-journey";
import { toNumber } from "./utils";

export type SyncResult = {
  affiliatesUpserted: number;
  commissionsUpserted: number;
  profilesLinked: number;
  overridesCreated: number;
  teamsSynced: number;
  slicewpPayoutsSynced: number;
  visitsUpserted: number;
  creativesUpserted: number;
  couponsUpserted: number;
};

/** Rows per bulk statement. Larger chunks mean fewer round-trips. */
const COMMISSION_CHUNK_SIZE = 500;

/**
 * Below this many rows the SliceWP fetch was truncated rather than the store
 * being small, and pruning against a partial list would delete live money.
 */
const MIN_REMOTE_COMMISSIONS_TO_PRUNE = 1_000;

/**
 * A healthy store loses a handful of commissions to re-attribution per sync.
 * Losing a twentieth of the book at once means the fetch lied, not that the
 * rows are gone.
 */
const MAX_PRUNE_SHARE = 0.05;

/**
 * How much smaller than the previous sync a fetch may be before pruning is
 * refused. Non-zero because SliceWP genuinely deletes rows on re-attribution
 * and refunds; small because a truncated page is a much bigger drop.
 */
const MAX_FETCH_SHRINK = 0.02;

/** Ledger types derived from commissions, so they die with their source row. */
const DERIVED_LEDGER_TYPES = [
  LedgerEntryType.DIRECT,
  LedgerEntryType.OVERRIDE,
] as const;

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
function toValidAffiliate(
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

function affiliateUserIds(remotes: SliceWPAffiliate[]): number[] {
  return remotes
    .map((remote) => Number(remote.user_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function upsertAffiliate(
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

  const { visitSlicewpId, customerSlicewpId } =
    visitAndCustomerFromRemote(remote);

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
    visitSlicewpId,
    customerSlicewpId,
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
  const touched = Array.from(touchedAffiliateIds);
  await syncCommissionBases(touched);
  await syncDirectLedgerEntries(touched);
  await syncLedgerCommissionBases();

  return count;
}

export type CommissionPruneResult = {
  commissionsDeleted: number;
  ledgerEntriesDeleted: number;
  /** Rows SliceWP dropped that are already paid out, so they are left alone. */
  settledKept: number;
  /** Set when a safety guard refused the pass; no rows were touched. */
  skipped: string | null;
};

/**
 * How many commissions the last healthy sync pulled, or null when there is no
 * baseline yet — a first run has nothing to compare against and skips pruning.
 */
async function lastSuccessfulCommissionFetchCount(): Promise<number | null> {
  const logs = await prisma.syncLog.findMany({
    where: { type: "commissions", status: "success" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { metadata: true },
  });

  for (const log of logs) {
    const metadata = log.metadata;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const fetched = (metadata as Prisma.JsonObject).fetched;
      if (typeof fetched === "number" && fetched > 0) return fetched;
    }
  }

  return null;
}

/**
 * Deletes commissions SliceWP no longer has.
 *
 * SliceWP re-attributes an order by deleting the old commission and inserting a
 * new one for the correct affiliate, and voids one outright on a refund. Upserts
 * alone never notice either, so the superseded row lives here forever and the
 * same order revenue is credited twice — once to the affiliate SliceWP dropped
 * and once to the one it moved the order to.
 *
 * Only safe against a complete fetch. Never call this from the per-affiliate
 * sync, whose commission list covers one downline and would make every other
 * affiliate's rows look deleted.
 *
 * `LedgerEntry.sourceCommission` is `onDelete: SetNull` and the ledger
 * reconciler only ever inserts and updates, so the derived entries have to be
 * deleted here or they survive as unpaid money with no source.
 */
async function pruneCommissionsMissingFromSliceWP(
  remoteCommissions: SliceWPCommission[]
): Promise<CommissionPruneResult> {
  const empty: CommissionPruneResult = {
    commissionsDeleted: 0,
    ledgerEntriesDeleted: 0,
    settledKept: 0,
    skipped: null,
  };

  if (remoteCommissions.length < MIN_REMOTE_COMMISSIONS_TO_PRUNE) {
    return {
      ...empty,
      skipped: `SliceWP returned only ${remoteCommissions.length} commissions, below the ${MIN_REMOTE_COMMISSIONS_TO_PRUNE} floor`,
    };
  }

  // The commission book only grows, so a fetch smaller than last night's means
  // pagination dropped pages rather than that SliceWP lost rows. This is the
  // guard that matters: a fixed floor cannot tell 9,400 of 9,500 from 9,400 of
  // 9,400, and the difference is a hundred wrongly deleted commissions.
  const previousFetch = await lastSuccessfulCommissionFetchCount();
  if (
    previousFetch !== null &&
    remoteCommissions.length < previousFetch * (1 - MAX_FETCH_SHRINK)
  ) {
    return {
      ...empty,
      skipped: `SliceWP returned ${remoteCommissions.length} commissions against ${previousFetch} last sync, a drop beyond the ${(MAX_FETCH_SHRINK * 100).toFixed(0)}% tolerance`,
    };
  }

  const remoteIds = new Set<number>();
  for (const remote of remoteCommissions) {
    const id = Number(remote.id);
    if (Number.isFinite(id)) remoteIds.add(id);
  }

  const local = await prisma.commission.findMany({
    select: { id: true, slicewpId: true },
  });
  const doomed = local.filter((row) => !remoteIds.has(row.slicewpId));
  if (doomed.length === 0) return empty;

  const share = doomed.length / local.length;
  if (share > MAX_PRUNE_SHARE) {
    return {
      ...empty,
      skipped: `${(share * 100).toFixed(1)}% of commissions looked deleted, above the ${(MAX_PRUNE_SHARE * 100).toFixed(0)}% ceiling`,
    };
  }

  const doomedIds = doomed.map((row) => row.id);
  const doomedSlicewpIds = doomed.map((row) => row.slicewpId);
  const slicewpIdByLocalId = new Map(doomed.map((row) => [row.id, row.slicewpId]));
  const doomedSlicewpIdSet = new Set(doomedSlicewpIds);

  // Matched two ways because older DIRECT entries predate the foreign key and
  // only carry `slicewpCommissionId`. Manual BONUS and ADJUSTMENT rows are
  // never derived from a commission, so they are deliberately out of scope.
  const candidates = await prisma.ledgerEntry.findMany({
    where: {
      OR: [
        { sourceCommissionId: { in: doomedIds } },
        {
          type: { in: [...DERIVED_LEDGER_TYPES] },
          slicewpCommissionId: { in: doomedSlicewpIds },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      paidAt: true,
      payoutBatchId: true,
      sourceCommissionId: true,
      slicewpCommissionId: true,
    },
  });

  /** Which pruned commission an entry belongs to, or null if it belongs to none. */
  const ownerOf = (entry: (typeof candidates)[number]): number | null => {
    if (
      entry.slicewpCommissionId != null &&
      doomedSlicewpIdSet.has(entry.slicewpCommissionId)
    ) {
      return entry.slicewpCommissionId;
    }
    if (entry.sourceCommissionId) {
      return slicewpIdByLocalId.get(entry.sourceCommissionId) ?? null;
    }
    return null;
  };

  // Money that has left the building is never rewritten by a sync. One settled
  // entry protects its whole commission so the two never disagree.
  const settled = new Set<number>();
  for (const entry of candidates) {
    const isSettled =
      entry.status === "PAID" ||
      entry.paidAt !== null ||
      entry.payoutBatchId !== null;
    if (!isSettled) continue;
    const owner = ownerOf(entry);
    if (owner !== null) settled.add(owner);
  }

  const ledgerIdsToDelete = candidates
    .filter((entry) => {
      const owner = ownerOf(entry);
      return owner !== null && !settled.has(owner);
    })
    .map((entry) => entry.id);

  const commissionIdsToDelete = doomed
    .filter((row) => !settled.has(row.slicewpId))
    .map((row) => row.id);

  if (commissionIdsToDelete.length === 0) {
    return { ...empty, settledKept: settled.size };
  }

  let ledgerEntriesDeleted = 0;
  let commissionsDeleted = 0;

  // Ledger first: the foreign key nulls rather than cascades, so the reverse
  // order would strand live unpaid rows.
  for (let i = 0; i < ledgerIdsToDelete.length; i += COMMISSION_CHUNK_SIZE) {
    const result = await prisma.ledgerEntry.deleteMany({
      where: { id: { in: ledgerIdsToDelete.slice(i, i + COMMISSION_CHUNK_SIZE) } },
    });
    ledgerEntriesDeleted += result.count;
  }

  for (let i = 0; i < commissionIdsToDelete.length; i += COMMISSION_CHUNK_SIZE) {
    const result = await prisma.commission.deleteMany({
      where: {
        id: { in: commissionIdsToDelete.slice(i, i + COMMISSION_CHUNK_SIZE) },
      },
    });
    commissionsDeleted += result.count;
  }

  return {
    commissionsDeleted,
    ledgerEntriesDeleted,
    settledKept: settled.size,
    skipped: null,
  };
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

  // After the upserts, so a row that moved to another affiliate is written in
  // its new home before the old one is removed.
  const pruned = await pruneCommissionsMissingFromSliceWP(remoteCommissions);

  const journey = await enrichCommissionJourneyAfterSync();

  // Enrichment is the only thing that learns an order's shipping and tax, so the
  // commissionable base for the orders it just fetched is only knowable now.
  if (journey.enriched > 0) {
    await syncCommissionBases();
    await syncDirectLedgerEntries();
    await syncLedgerCommissionBases();
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
      message:
        pruned.commissionsDeleted > 0
          ? `Synced ${count} commissions, removed ${pruned.commissionsDeleted} deleted in SliceWP`
          : `Synced ${count} commissions`,
      metadata: {
        count,
        fetched: remoteCommissions.length,
        journeyEnriched: journey.enriched,
        journeyPending: journey.pendingRemaining,
        journeyBridgeAvailable: journey.bridgeAvailable,
        prunedCommissions: pruned.commissionsDeleted,
        prunedLedgerEntries: pruned.ledgerEntriesDeleted,
        pruneSettledKept: pruned.settledKept,
        pruneSkipped: pruned.skipped,
      },
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
  slicewpPayoutsSynced: number;
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

  assertSyncTargetsAgree(settings.wcStoreUrl);

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

  const customers = await fetchWooCustomersByIds(
    settings.wcStoreUrl,
    settings.wcConsumerKey,
    settings.wcConsumerSecret,
    affiliateUserIds([remote])
  );

  const valid = toValidAffiliate(remote, customers.get(Number(remote.user_id)));
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
  const slicewpPayoutsSynced = await syncSlicewpPayoutsSafely([affiliate.id]);

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
        slicewpPayoutsSynced,
      },
    },
  });

  return {
    affiliateId: affiliate.id,
    slicewpId: affiliate.slicewpId,
    displayName: affiliate.displayName,
    recruitsIncluded: recruits.length,
    commissionsUpserted,
    slicewpPayoutsSynced,
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
  assertSyncTargetsAgree((await getSettings()).wcStoreUrl);

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

  await setSyncStep("payouts");
  const slicewpPayoutsSynced = await syncSlicewpPayoutsSafely();

  await setSyncStep("parity");
  const parity = await syncParitySafely();

  const overridesCreated = await prisma.ledgerEntry.count({
    where: { type: "OVERRIDE" },
  });

  return {
    affiliatesUpserted,
    commissionsUpserted,
    profilesLinked,
    overridesCreated,
    teamsSynced,
    slicewpPayoutsSynced,
    ...parity,
  };
}

/**
 * Visits, creatives, coupons and referral links.
 *
 * Each is isolated: none of it affects what anyone is owed, so a store without
 * the bridge plugin, or one where a single step fails, should still finish the
 * sync with its money data intact. Failures land in the sync log instead.
 */
async function syncParitySafely(): Promise<{
  visitsUpserted: number;
  creativesUpserted: number;
  couponsUpserted: number;
}> {
  const step = async <T>(
    type: string,
    run: () => Promise<T>,
    describe: (result: T) => { message: string; metadata: Prisma.InputJsonValue }
  ): Promise<T | null> => {
    try {
      const result = await run();
      const { message, metadata } = describe(result);
      await prisma.syncLog.create({
        data: { type, status: "success", message, metadata },
      });
      return result;
    } catch (error) {
      await prisma.syncLog.create({
        data: { type, status: "error", message: formatSyncError(error) },
      });
      return null;
    }
  };

  const visits = await step("visits", syncVisits, (result) => ({
    message: `${result.incremental ? "Synced" : "Backfilled"} ${result.upserted} visits`,
    metadata: { ...result },
  }));

  const creatives = await step("creatives", syncCreatives, (result) => ({
    message: `Synced ${result.upserted} creatives`,
    metadata: { ...result },
  }));

  const extras = await step("affiliate-extras", syncAffiliateExtras, (result) => ({
    message: `Synced ${result.couponsUpserted} coupons and ${result.slugsFound} custom slugs`,
    metadata: { ...result },
  }));

  return {
    visitsUpserted: visits?.upserted ?? 0,
    creativesUpserted: creatives?.upserted ?? 0,
    couponsUpserted: extras?.couponsUpserted ?? 0,
  };
}

/**
 * Payout receipts are a read-only mirror, so a store whose REST add-on
 * predates `/payments/` should still get its affiliates and commissions
 * rather than failing the whole run.
 */
async function syncSlicewpPayoutsSafely(
  affiliateIds?: string[]
): Promise<number> {
  try {
    const { upserted, removed } = await syncSlicewpPayments(
      affiliateIds ? { affiliateIds } : undefined
    );
    await prisma.syncLog.create({
      data: {
        type: "slicewp-payouts",
        status: "success",
        message: `Synced ${upserted} SliceWP payouts`,
        metadata: { upserted, removed },
      },
    });
    return upserted;
  } catch (error) {
    const message = formatSyncError(error);
    await prisma.syncLog.create({
      data: {
        type: "slicewp-payouts",
        status: isMissingPaymentsEndpoint(error) ? "skipped" : "error",
        message: isMissingPaymentsEndpoint(error)
          ? "SliceWP has no /payments/ endpoint — update the REST API add-on to import payouts."
          : message,
      },
    });
    return 0;
  }
}

export async function runFullSyncJob(): Promise<SyncResult> {
  try {
    const result = await runFullSync();
    await completeSync(result);
    return result;
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
