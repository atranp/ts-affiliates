import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Compares the M4 mirror against SliceWP's own database.
 *
 * Read-only on both sides. Counts alone would not catch a timezone bug or a
 * mis-joined affiliate, so it also checks the extremes of the date range and
 * per-affiliate totals.
 *
 * Usage: npx tsx scripts/m4-verify.ts
 */

import { execFileSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

const MYSQL = join(
  homedir(),
  "Library/Application Support/Local/lightning-services",
  "mysql-8.4.0/bin/darwin-arm64/bin/mysql"
);
const SOCKET = join(
  homedir(),
  "Library/Application Support/Local/run/CSuFeBXEl/mysql/mysqld.sock"
);

function wp(sql: string): string[][] {
  const out = execFileSync(
    MYSQL,
    ["-u", "root", "-proot", "-S", SOCKET, "-N", "local", "-e", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function one(sql: string): string {
  return wp(sql)[0]?.[0] ?? "";
}

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}\n      ${detail}`);
}

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("comparing the platform mirror against SliceWP's tables\n");

  // ---- visits -------------------------------------------------------------

  const wpVisits = Number(one("SELECT COUNT(*) FROM zww_slicewp_visits"));
  const pgVisits = await prisma.visit.count();

  // A visit whose affiliate no longer exists cannot be mirrored, so it is
  // excluded from the expected total rather than counted as a loss.
  const wpOrphans = Number(
    one(`SELECT COUNT(*) FROM zww_slicewp_visits v
         LEFT JOIN zww_slicewp_affiliates a ON a.id = v.affiliate_id
         WHERE a.id IS NULL`)
  );

  record(
    "every visit is mirrored",
    pgVisits === wpVisits - wpOrphans,
    `SliceWP ${wpVisits} (− ${wpOrphans} orphaned) vs platform ${pgVisits}`
  );

  const wpConverted = Number(
    one("SELECT COUNT(*) FROM zww_slicewp_visits WHERE commission_id > 0")
  );
  const pgConverted = await prisma.visit.count({
    where: { slicewpCommissionId: { not: null } },
  });

  record(
    "conversions are mirrored",
    pgConverted === wpConverted,
    `${wpConverted} converted in SliceWP vs ${pgConverted} here`
  );

  // Timestamps are the easiest thing to get quietly wrong: SliceWP stores GMT
  // with no marker, so a naive parse shifts every row by the local offset.
  const wpNewest = one("SELECT MAX(date_created) FROM zww_slicewp_visits");
  const pgNewest = await prisma.visit.findFirst({
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  const expectedNewest = `${wpNewest.replace(" ", "T")}.000Z`;

  record(
    "visit timestamps are read as GMT",
    pgNewest?.occurredAt.toISOString() === expectedNewest,
    `SliceWP ${wpNewest} GMT → ${pgNewest?.occurredAt.toISOString()}`
  );

  const wpOldest = one("SELECT MIN(date_created) FROM zww_slicewp_visits");
  const pgOldest = await prisma.visit.findFirst({
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true },
  });

  record(
    "the full history was backfilled, not just recent rows",
    pgOldest?.occurredAt.toISOString() === `${wpOldest.replace(" ", "T")}.000Z`,
    `oldest ${pgOldest?.occurredAt.toISOString()} matches SliceWP ${wpOldest}`
  );

  // Per-affiliate totals catch a join that lands rows on the wrong owner —
  // something a global count would happily miss.
  const wpBusiest = wp(
    `SELECT affiliate_id, COUNT(*) FROM zww_slicewp_visits
     GROUP BY affiliate_id ORDER BY COUNT(*) DESC LIMIT 5`
  );

  let attributionOk = true;
  const details: string[] = [];

  for (const [slicewpId, expected] of wpBusiest) {
    const affiliate = await prisma.affiliate.findUnique({
      where: { slicewpId: Number(slicewpId) },
      select: { id: true, displayName: true },
    });
    const actual = affiliate
      ? await prisma.visit.count({ where: { affiliateId: affiliate.id } })
      : 0;

    if (actual !== Number(expected)) attributionOk = false;
    details.push(`#${slicewpId}: ${expected}/${actual}`);
  }

  record(
    "visits land on the right affiliate",
    attributionOk,
    `SliceWP/platform for the five busiest — ${details.join(", ")}`
  );

  // ---- creatives, coupons, slugs -----------------------------------------

  const wpCreatives = Number(one("SELECT COUNT(*) FROM zww_slicewp_creatives"));
  const pgCreatives = await prisma.creative.count();
  const pgActive = await prisma.creative.count({ where: { status: "active" } });

  record(
    "creatives mirror, including inactive ones",
    pgCreatives === wpCreatives && pgActive === 2,
    `${pgCreatives} of ${wpCreatives}, ${pgActive} active`
  );

  const wpCoupons = Number(
    one(`SELECT COUNT(*) FROM zww_postmeta pm
         JOIN zww_posts p ON p.ID = pm.post_id
         WHERE pm.meta_key = 'slicewp_affiliate_id' AND pm.meta_value <> ''`)
  );
  const pgCoupons = await prisma.affiliateCoupon.count();

  record(
    "affiliate coupons mirror",
    pgCoupons === wpCoupons,
    `${wpCoupons} linked in WooCommerce vs ${pgCoupons} here`
  );

  const wpSlugs = Number(
    one(`SELECT COUNT(*) FROM zww_slicewp_affiliate_meta
         WHERE meta_key = 'custom_slug' AND meta_value <> ''`)
  );
  const pgSlugs = await prisma.affiliate.count({
    where: { customSlug: { not: null } },
  });

  record(
    "custom slugs mirror",
    pgSlugs === wpSlugs,
    `${wpSlugs} in SliceWP meta vs ${pgSlugs} here`
  );

  const missingReferral = await prisma.affiliate.count({
    where: { referralUrl: null },
  });

  record(
    "every affiliate has a referral link",
    missingReferral === 0,
    `${missingReferral} affiliates without one`
  );

  // The repaired settings option is what makes these well-formed; a regression
  // would silently reintroduce the `/?=120` form.
  const malformed = await prisma.affiliate.count({
    where: { referralUrl: { contains: "/?=" } },
  });

  record(
    "referral links are well-formed",
    malformed === 0,
    malformed === 0
      ? "none contain the `/?=` shape that a broken settings blob produces"
      : `${malformed} look like /?=id`
  );

  const sample = await prisma.affiliate.findFirst({
    where: { customSlug: { not: null } },
    select: { displayName: true, customSlug: true, referralUrl: true },
  });
  console.log(
    `\n      e.g. ${sample?.displayName ?? "?"} → ${sample?.referralUrl} (slug "${sample?.customSlug}")`
  );

  // ---- coupon shape -------------------------------------------------------

  const coupon = await prisma.affiliateCoupon.findFirst({
    select: { code: true, origin: true, amount: true, uses: true },
  });

  record(
    "coupon detail survives the round trip",
    !!coupon?.code && !!coupon?.amount && coupon?.uses !== null,
    `${coupon?.origin}/${coupon?.code} ${coupon?.amount} uses=${JSON.stringify(coupon?.uses)}`
  );

  if (process.argv.includes("--drill")) {
    await conversionDrill(prisma);
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) throw new Error(`${failed.length} check(s) failed.`);
}

/**
 * The case the incremental sync exists to survive.
 *
 * A visit from weeks ago earns a commission today. SliceWP mutates that old
 * row in place, leaving `date_created` untouched — so the date watermark will
 * never look at it again, and only the separate `converted=true` pass can
 * notice. Marks an old visit as converted, syncs, and checks it arrives.
 *
 * Mutates Local WordPress and puts it back.
 */
async function conversionDrill(
  prisma: typeof import("../lib/prisma").prisma
): Promise<void> {
  console.log("\nconversion drill — back-filling a commission onto an old visit");

  const [target] = wp(
    `SELECT v.id, v.date_created FROM zww_slicewp_visits v
     JOIN zww_slicewp_affiliates a ON a.id = v.affiliate_id
     WHERE v.commission_id = 0
     ORDER BY v.date_created ASC LIMIT 1`
  );

  if (!target) {
    record("conversion drill", false, "no unconverted visit to use");
    return;
  }

  const [visitId, visitDate] = target;
  const fakeCommissionId = 999999;

  const watermark = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { lastVisitSyncedThrough: true },
  });

  const before = await prisma.visit.findUnique({
    where: { slicewpId: Number(visitId) },
    select: { slicewpCommissionId: true },
  });

  wp(
    `UPDATE zww_slicewp_visits SET commission_id = ${fakeCommissionId} WHERE id = ${visitId}`
  );

  try {
    const { syncVisits } = await import("../lib/sync-parity");
    const result = await syncVisits();

    const after = await prisma.visit.findUnique({
      where: { slicewpId: Number(visitId) },
      select: { slicewpCommissionId: true },
    });

    record(
      "a conversion on an old visit is still picked up",
      before?.slicewpCommissionId === null &&
        after?.slicewpCommissionId === fakeCommissionId,
      `visit ${visitId} from ${visitDate} (watermark ${watermark?.lastVisitSyncedThrough?.toISOString().slice(0, 10)}) ` +
        `went ${before?.slicewpCommissionId} → ${after?.slicewpCommissionId} after fetching ${result.fetched} rows`
    );

    record(
      "the date pass alone would have missed it",
      new Date(`${visitDate.replace(" ", "T")}Z`) <
        (watermark?.lastVisitSyncedThrough ?? new Date(0)),
      `${visitDate} is behind the watermark, so only the converted pass could see it`
    );
  } finally {
    wp(`UPDATE zww_slicewp_visits SET commission_id = 0 WHERE id = ${visitId}`);
    await prisma.visit.update({
      where: { slicewpId: Number(visitId) },
      data: { slicewpCommissionId: null },
    });
    console.log(`      restored visit ${visitId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
