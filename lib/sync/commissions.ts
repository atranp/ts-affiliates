import { LedgerEntryType, Prisma } from "@prisma/client";
import { getSettings } from "../settings";
import {
  fetchAllSliceWPCommissions,
  mapSliceWPCommissionStatus,
  type SliceWPCommission,
} from "../slicewp";
import { prisma } from "../prisma";
import { getRecruitRevenueMap } from "../admin/team";
import { createSyncDealRuleProcessor } from "../rules-engine";
import {
  bulkUpsertCommissions,
  syncCommissionBases,
  syncDirectLedgerEntries,
  syncLedgerCommissionBases,
  type CommissionUpsertRow,
} from "./write";
import {
  enrichCommissionJourneyAfterSync,
  visitAndCustomerFromRemote,
} from "./journey";
import { toNumber } from "../utils";
import { COMMISSION_CHUNK_SIZE } from "./constants";


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
export async function persistRemoteCommissions(
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
