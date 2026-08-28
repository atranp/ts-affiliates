import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * End-to-end check of the M5 portal layer, one level above the bridge smoke:
 * the affiliate-scoped reads that back the new tabs, and a settings save that
 * has to land in SliceWP *and* the mirror.
 *
 * Runs against a cohort affiliate only, and restores what it changes.
 *
 * Usage: npm run m5-verify
 */

import { assertTestAffiliate, isCohortEmail } from "./cohort";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}\n      ${detail}`);
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { getSettings } = await import("../lib/settings");
  const { shouldMirrorWrites } = await import("../lib/env-guard");
  const {
    getAffiliateLink,
    getAffiliateVisits,
    getAffiliateCoupons,
    getActiveCreatives,
  } = await import("../lib/affiliate/reach");
  const { applyAffiliateSelfEdit } = await import(
    "../lib/affiliate/settings-write"
  );
  const { fetchAffiliateExtras } = await import("../lib/slicewp-bridge");
  const { fetchSliceWPAffiliateById } = await import("../lib/slicewp");

  const settings = await getSettings();
  console.log(`store:      ${settings.wcStoreUrl}`);
  console.log(`mirroring:  ${shouldMirrorWrites(settings.wcStoreUrl)}\n`);

  // Resolve the cohort affiliate from the mirror, since these reads are all
  // keyed by the platform id rather than the SliceWP one.
  const candidates = await prisma.affiliate.findMany({
    select: {
      id: true,
      slicewpId: true,
      paymentEmail: true,
      displayName: true,
      customSlug: true,
      website: true,
    },
  });

  const affiliate = candidates.find((row) => isCohortEmail(row.paymentEmail));

  if (!affiliate) {
    throw new Error(
      "No cohort affiliate in the mirror. Run: npm run cohort seed && npm run dev-sync"
    );
  }

  assertTestAffiliate({
    id: affiliate.slicewpId,
    payment_email: affiliate.paymentEmail,
  });

  console.log(
    `affiliate:  ${affiliate.displayName} (platform ${affiliate.id}, slicewp #${affiliate.slicewpId})\n`
  );

  // ---- reads ---------------------------------------------------------------

  const link = await getAffiliateLink(affiliate.id);

  record(
    "link read returns a referral url",
    typeof link.referralUrl === "string" && link.referralUrl.length > 0,
    `${link.referralUrl ?? "(none)"} — slug ${link.customSlug ?? "(none)"}`
  );

  const visits = await getAffiliateVisits(affiliate.id, { page: 1 });

  record(
    "visit stats are internally consistent",
    visits.stats.last7Days <= visits.stats.last30Days &&
      visits.stats.last30Days <= visits.stats.total &&
      visits.stats.converted <= visits.stats.total,
    `${visits.stats.total} total, ${visits.stats.last30Days} in 30d, ${visits.stats.last7Days} in 7d, ${visits.stats.converted} converted`
  );

  record(
    "visit rows are capped at one page and newest first",
    visits.recent.length <= visits.pageSize &&
      visits.recent.every(
        (row, index) =>
          index === 0 ||
          row.occurredAt <= visits.recent[index - 1].occurredAt
      ),
    `${visits.recent.length} of ${visits.total} rows, page size ${visits.pageSize}`
  );

  // The trend feeds the chart, so the sum of its days must not exceed the
  // 30-day count the headline stat reports.
  const trendTotal = visits.daily.reduce((sum, day) => sum + day.visits, 0);

  record(
    "daily trend agrees with the 30-day count",
    trendTotal === visits.stats.last30Days,
    `${visits.daily.length} days summing to ${trendTotal}, stat says ${visits.stats.last30Days}`
  );

  // Paging past the end must be empty rather than repeating page one.
  if (visits.total > visits.pageSize) {
    const page2 = await getAffiliateVisits(affiliate.id, { page: 2 });
    const overlap = page2.recent.filter((row) =>
      visits.recent.some((first) => first.id === row.id)
    );

    record(
      "page 2 does not repeat page 1",
      overlap.length === 0 && page2.recent.length > 0,
      `${page2.recent.length} rows, ${overlap.length} overlapping`
    );
  } else {
    record(
      "page 2 does not repeat page 1",
      true,
      `skipped — only ${visits.total} visits, one page`
    );
  }

  const coupons = await getAffiliateCoupons(affiliate.id);

  record(
    "coupon totals match their per-status counts",
    coupons.every(
      (coupon) =>
        coupon.totalUses ===
        Object.values(coupon.uses ?? {}).reduce(
          (sum, count) => sum + (count || 0),
          0
        )
    ),
    coupons.length === 0
      ? "no coupons on this affiliate"
      : coupons
          .map((coupon) => `${coupon.code}=${coupon.totalUses}`)
          .join(", ")
  );

  const creatives = await getActiveCreatives();
  const inactive = await prisma.creative.count({
    where: { status: { not: "active" } },
  });

  record(
    "only active creatives are served",
    creatives.every((creative) => creative.id.length > 0) &&
      creatives.length ===
        (await prisma.creative.count({ where: { status: "active" } })),
    `${creatives.length} active, ${inactive} withheld`
  );

  // ---- a save that has to reach both sides ---------------------------------

  const originalSlug = affiliate.customSlug ?? "";
  const originalWebsite = affiliate.website ?? "";
  const freshSlug = `tsv${Date.now().toString(36).slice(-5)}`;
  const freshWebsite = `https://m5-verify-${freshSlug}.example.com`;

  const saved = await applyAffiliateSelfEdit({
    affiliateId: affiliate.id,
    edit: { customSlug: freshSlug, website: freshWebsite },
  });

  record(
    "save returns the rebuilt referral link",
    saved.customSlug === freshSlug && saved.referralUrl.includes(freshSlug),
    `${saved.customSlug} → ${saved.referralUrl}`
  );

  // Read the slug back out of WordPress rather than trusting the response to
  // the write — a save that only echoed its input would pass otherwise.
  const [readback] = await fetchAffiliateExtras({
    slicewpAffiliateIds: [affiliate.slicewpId],
    includeCoupons: false,
  });

  record(
    "SliceWP is the one that actually changed",
    readback?.custom_slug === freshSlug &&
      readback.referral_url === saved.referralUrl,
    `wordpress reports slug ${readback?.custom_slug ?? "(none)"} → ${readback?.referral_url ?? "(none)"}`
  );

  // Website is a column on SliceWP's affiliates table, so it has to land where
  // SliceWP's own admin reads it — not in affiliate meta, which looks identical
  // on a write-then-read but is invisible to every other consumer.
  const fromSliceWP = await fetchSliceWPAffiliateById(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
    affiliate.slicewpId
  );

  record(
    "website lands on the affiliate record SliceWP itself reads",
    fromSliceWP?.website === freshWebsite,
    `slicewp's own affiliate payload reports ${fromSliceWP?.website || "(none)"}`
  );

  const mirrored = await getAffiliateLink(affiliate.id);

  if (saved.mirrored) {
    record(
      "the mirror followed the save",
      mirrored.customSlug === freshSlug &&
        mirrored.referralUrl === saved.referralUrl,
      `mirror slug ${mirrored.customSlug}, link ${mirrored.referralUrl}`
    );
  } else {
    record(
      "the mirror was correctly left alone",
      mirrored.customSlug === (affiliate.customSlug ?? null),
      "store and database are different environments, so no mirror write"
    );
  }

  if (saved.mirrored) {
    const mirroredWebsite = await prisma.affiliate.findUnique({
      where: { id: affiliate.id },
      select: { website: true },
    });

    record(
      "website is mirrored too",
      mirroredWebsite?.website === freshWebsite,
      `mirror holds ${mirroredWebsite?.website ?? "(none)"}`
    );
  }

  // Restore.
  await applyAffiliateSelfEdit({
    affiliateId: affiliate.id,
    edit: { customSlug: originalSlug, website: originalWebsite },
  });

  console.log(
    `\n      restored slug to ${originalSlug || "(none)"}, website to ${originalWebsite || "(none)"}`
  );

  // ---- the same reads against real traffic ---------------------------------
  //
  // The cohort affiliate is freshly seeded and has no history, so the checks
  // above pass on empty sets. Repeat the read-only ones against the busiest
  // real affiliate, where the paging and trend maths actually have to hold.

  const busiest = await prisma.visit.groupBy({
    by: ["affiliateId"],
    _count: { _all: true },
    orderBy: { _count: { affiliateId: "desc" } },
    take: 1,
  });

  const busiestId = busiest[0]?.affiliateId;

  if (!busiestId) {
    record("real-traffic reads", false, "no visits in the mirror to read");
  } else {
    console.log(
      `\nre-reading against the busiest affiliate (${busiest[0]._count._all} visits)\n`
    );

    const real = await getAffiliateVisits(busiestId, { page: 1 });
    const realTrend = real.daily.reduce((sum, day) => sum + day.visits, 0);

    record(
      "real: stats and trend agree",
      real.stats.last7Days <= real.stats.last30Days &&
        real.stats.last30Days <= real.stats.total &&
        realTrend === real.stats.last30Days,
      `${real.stats.total} total, ${real.stats.last30Days} in 30d (trend sums to ${realTrend}), ${real.stats.converted} converted`
    );

    record(
      "real: a full page comes back newest first",
      real.recent.length === Math.min(real.pageSize, real.total) &&
        real.recent.every(
          (row, index) =>
            index === 0 || row.occurredAt <= real.recent[index - 1].occurredAt
        ),
      `${real.recent.length} rows, newest ${real.recent[0]?.occurredAt}`
    );

    const lastPage = Math.ceil(real.total / real.pageSize);
    const tail = await getAffiliateVisits(busiestId, { page: lastPage });

    record(
      "real: the last page is a partial page of older rows",
      tail.recent.length > 0 &&
        tail.recent.length <= real.pageSize &&
        (tail.recent[0]?.occurredAt ?? "") <=
          (real.recent[real.recent.length - 1]?.occurredAt ?? ""),
      `page ${lastPage} of ${lastPage} holds ${tail.recent.length} rows, oldest ${tail.recent[tail.recent.length - 1]?.occurredAt}`
    );

    const beyond = await getAffiliateVisits(busiestId, { page: lastPage + 5 });

    record(
      "real: paging past the end is empty, not a repeat",
      beyond.recent.length === 0 && beyond.stats.total === real.stats.total,
      `page ${lastPage + 5} returned ${beyond.recent.length} rows`
    );

    const realCoupons = await getAffiliateCoupons(busiestId);

    record(
      "real: coupon totals match their per-status counts",
      realCoupons.every(
        (coupon) =>
          coupon.totalUses ===
          Object.values(coupon.uses ?? {}).reduce(
            (sum, count) => sum + (count || 0),
            0
          )
      ),
      realCoupons.length === 0
        ? "this affiliate has no coupons"
        : realCoupons
            .map((coupon) => `${coupon.code}=${coupon.totalUses}`)
            .join(", ")
    );
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed.`
  );
  if (failed.length > 0) throw new Error(`${failed.length} check(s) failed.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
