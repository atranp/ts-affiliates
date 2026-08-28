import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { fetchSliceWPVisits, type SliceWPVisit } from "./slicewp";
import { fetchAffiliateExtras, fetchCreatives } from "./slicewp-bridge";

/**
 * Read parity: the SliceWP data an affiliate sees in the WordPress portal that
 * is not part of the money trail — visits, creatives, coupons and referral
 * links.
 *
 * Nothing here writes to WordPress. These are mirrors, and a failure in any of
 * them is reported rather than aborting the sync, because none of it is needed
 * to pay anyone correctly.
 */

/** Rows per statement. Visits arrive in the tens of thousands. */
const VISIT_CHUNK_SIZE = 2000;

/**
 * SliceWP stores GMT timestamps without a timezone marker, so `new Date(...)`
 * would read them as local time and shift the watermark by the UTC offset —
 * enough to skip a window of visits on every sync.
 */
function parseGmt(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The inverse, for handing a watermark back to SliceWP. */
function toGmtString(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function blankToNull(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type VisitRow = {
  slicewpId: number;
  affiliateId: string;
  landingUrl: string | null;
  referrerUrl: string | null;
  slicewpCommissionId: number | null;
  occurredAt: Date;
};

async function bulkUpsertVisits(
  rows: VisitRow[],
  syncedAt: Date
): Promise<number> {
  if (rows.length === 0) return 0;

  // Offset paging over a live table can hand back the same visit twice, and
  // Postgres rejects an upsert whose VALUES hit one conflict target twice.
  const unique = Array.from(
    new Map(rows.map((row) => [row.slicewpId, row])).values()
  );

  let written = 0;

  for (let start = 0; start < unique.length; start += VISIT_CHUNK_SIZE) {
    const chunk = unique.slice(start, start + VISIT_CHUNK_SIZE);

    const values = chunk.map(
      (row) => Prisma.sql`(
        ${randomUUID()},
        ${row.slicewpId}::integer,
        ${row.affiliateId},
        ${row.landingUrl},
        ${row.referrerUrl},
        ${row.slicewpCommissionId}::integer,
        ${row.occurredAt}::timestamptz,
        ${syncedAt}::timestamptz
      )`
    );

    written += await prisma.$executeRaw`
      INSERT INTO "Visit" (
        "id", "slicewpId", "affiliateId", "landingUrl", "referrerUrl",
        "slicewpCommissionId", "occurredAt", "syncedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("slicewpId") DO UPDATE SET
        "affiliateId"         = EXCLUDED."affiliateId",
        "landingUrl"          = EXCLUDED."landingUrl",
        "referrerUrl"         = EXCLUDED."referrerUrl",
        "slicewpCommissionId" = EXCLUDED."slicewpCommissionId",
        "occurredAt"          = EXCLUDED."occurredAt",
        "syncedAt"            = EXCLUDED."syncedAt"
    `;
  }

  return written;
}

export type VisitSyncResult = {
  fetched: number;
  upserted: number;
  skippedUnknownAffiliate: number;
  /** False on the first run, or after the watermark is reset. */
  incremental: boolean;
  watermark: string | null;
};

/**
 * Mirrors referral link clicks.
 *
 * Two passes, because one is not enough:
 *
 *   1. **New visits** since the stored watermark. Visits are append-only, so a
 *      `date_created` lower bound is a complete description of what is new.
 *   2. **Converted visits**, unbounded by date. When a click later earns a
 *      commission SliceWP writes `commission_id` back onto the *original* row,
 *      whose `date_created` is already behind the watermark — pass 1 would
 *      never look at it again. This set stays small: it tracks the commission
 *      count, not the visit count.
 *
 * The watermark is SliceWP's own newest `date_created`, not the wall clock, so
 * a run that fails midway cannot advance past rows it never wrote.
 */
export async function syncVisits(): Promise<VisitSyncResult> {
  const settings = await getSettings();

  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    throw new Error("SliceWP credentials are not configured");
  }

  const previous = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { lastVisitSyncedThrough: true },
  });

  const watermark = previous?.lastVisitSyncedThrough ?? null;

  const [fresh, converted] = await Promise.all([
    fetchSliceWPVisits(
      settings.wcStoreUrl,
      settings.slicewpConsumerKey,
      settings.slicewpConsumerSecret,
      watermark ? { date_min: toGmtString(watermark) } : {}
    ),
    watermark
      ? fetchSliceWPVisits(
          settings.wcStoreUrl,
          settings.slicewpConsumerKey,
          settings.slicewpConsumerSecret,
          { converted: "true" }
        )
      : Promise.resolve([] as SliceWPVisit[]),
  ]);

  const remote = Array.from(
    new Map([...fresh, ...converted].map((visit) => [Number(visit.id), visit])).values()
  );

  const affiliates = await prisma.affiliate.findMany({
    select: { id: true, slicewpId: true },
  });
  const affiliateBySlicewpId = new Map(
    affiliates.map((affiliate) => [affiliate.slicewpId, affiliate.id])
  );

  let skippedUnknownAffiliate = 0;
  let newest = watermark;

  const rows: VisitRow[] = [];

  for (const visit of remote) {
    const slicewpId = Number(visit.id);
    const affiliateId = affiliateBySlicewpId.get(Number(visit.affiliate_id));
    const occurredAt = parseGmt(visit.date_created);

    if (!Number.isFinite(slicewpId) || !occurredAt) continue;

    // A visit can outlive the affiliate that earned it. Without a row to hang
    // it on there is nothing to mirror, so count it rather than failing.
    if (!affiliateId) {
      skippedUnknownAffiliate += 1;
      continue;
    }

    const commissionId = Number(visit.commission_id ?? 0);

    rows.push({
      slicewpId,
      affiliateId,
      landingUrl: blankToNull(visit.landing_url),
      referrerUrl: blankToNull(visit.referrer_url),
      slicewpCommissionId: commissionId > 0 ? commissionId : null,
      occurredAt,
    });

    if (!newest || occurredAt > newest) newest = occurredAt;
  }

  const syncedAt = new Date();
  const upserted = await bulkUpsertVisits(rows, syncedAt);

  // Only moved once the rows behind it are committed.
  if (newest && newest.getTime() !== watermark?.getTime()) {
    await prisma.settings.update({
      where: { id: "default" },
      data: { lastVisitSyncedThrough: newest },
    });
  }

  return {
    fetched: remote.length,
    upserted,
    skippedUnknownAffiliate,
    incremental: watermark !== null,
    watermark: newest?.toISOString() ?? null,
  };
}

export type CreativeSyncResult = { upserted: number; removed: number };

/**
 * Mirrors marketing assets. Inactive ones are mirrored too — the affiliate
 * portal hides them, but an admin looking at the list should see everything
 * that exists rather than wondering where a creative went.
 */
export async function syncCreatives(): Promise<CreativeSyncResult> {
  const [active, inactive] = await Promise.all([
    fetchCreatives(),
    fetchCreatives({ status: "inactive" }),
  ]);

  const remote = Array.from(
    new Map(
      [...active, ...inactive].map((creative) => [Number(creative.id), creative])
    ).values()
  ).filter((creative) => Number.isFinite(Number(creative.id)));

  const syncedAt = new Date();

  for (const creative of remote) {
    const slicewpId = Number(creative.id);
    const data = {
      name: creative.name ?? "",
      description: blankToNull(creative.description),
      type: creative.type ?? "text",
      imageUrl: blankToNull(creative.image_url),
      altText: blankToNull(creative.alt_text),
      text: blankToNull(creative.text),
      landingUrl: blankToNull(creative.landing_url),
      status: creative.status ?? "active",
      dateCreated: parseGmt(creative.date_created) ?? syncedAt,
      syncedAt,
    };

    await prisma.creative.upsert({
      where: { slicewpId },
      create: { slicewpId, ...data },
      update: data,
    });
  }

  // A creative deleted in WordPress should stop being offered here.
  const { count: removed } = await prisma.creative.deleteMany({
    where: { slicewpId: { notIn: remote.map((creative) => Number(creative.id)) } },
  });

  return { upserted: remote.length, removed };
}

export type AffiliateExtrasSyncResult = {
  affiliatesUpdated: number;
  couponsUpserted: number;
  couponsRemoved: number;
  slugsFound: number;
};

/**
 * Mirrors referral links, custom slugs, store credit and coupons.
 *
 * All four arrive from one bridge request. The referral URL is stored as
 * WordPress built it rather than assembled here, because the format depends on
 * SliceWP settings this app has no say over — reproducing that logic would
 * drift silently the first time someone changed the affiliate keyword.
 */
export async function syncAffiliateExtras(): Promise<AffiliateExtrasSyncResult> {
  const extras = await fetchAffiliateExtras();

  if (extras.length === 0) {
    return {
      affiliatesUpdated: 0,
      couponsUpserted: 0,
      couponsRemoved: 0,
      slugsFound: 0,
    };
  }

  const affiliates = await prisma.affiliate.findMany({
    select: { id: true, slicewpId: true },
  });
  const affiliateBySlicewpId = new Map(
    affiliates.map((affiliate) => [affiliate.slicewpId, affiliate.id])
  );

  const syncedAt = new Date();
  let affiliatesUpdated = 0;
  let slugsFound = 0;

  const couponRows: Array<{
    affiliateId: string;
    origin: string;
    externalId: number;
    code: string;
    amount: string | null;
    uses: Prisma.InputJsonValue;
  }> = [];

  for (const row of extras) {
    const affiliateId = affiliateBySlicewpId.get(row.affiliate_id);
    if (!affiliateId) continue;

    if (row.custom_slug) slugsFound += 1;

    await prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        customSlug: row.custom_slug,
        referralUrl: blankToNull(row.referral_url),
        storeCreditBalance:
          row.store_credit_balance === null
            ? null
            : new Prisma.Decimal(row.store_credit_balance),
      },
    });
    affiliatesUpdated += 1;

    for (const coupon of row.coupons ?? []) {
      const externalId = Number(coupon.id);
      if (!Number.isFinite(externalId) || !coupon.code) continue;

      couponRows.push({
        affiliateId,
        origin: coupon.origin || "unknown",
        externalId,
        code: coupon.code,
        amount: blankToNull(coupon.amount),
        uses: (coupon.uses ?? {}) as Prisma.InputJsonValue,
      });
    }
  }

  for (const coupon of couponRows) {
    await prisma.affiliateCoupon.upsert({
      where: {
        origin_externalId: {
          origin: coupon.origin,
          externalId: coupon.externalId,
        },
      },
      create: { ...coupon, syncedAt },
      update: { ...coupon, syncedAt },
    });
  }

  // A coupon unlinked from its affiliate in WordPress disappears from the
  // response entirely, so anything not seen this run no longer applies.
  const { count: couponsRemoved } = await prisma.affiliateCoupon.deleteMany({
    where: { syncedAt: { lt: syncedAt } },
  });

  return {
    affiliatesUpdated,
    couponsUpserted: couponRows.length,
    couponsRemoved,
    slugsFound,
  };
}
