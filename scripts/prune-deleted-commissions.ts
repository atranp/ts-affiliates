import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

if (process.env.BACKFILL_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  process.env.DIRECT_URL =
    process.env.BACKFILL_DIRECT_URL ?? process.env.BACKFILL_DATABASE_URL;

  // Settings are encrypted with the service role key, so decrypting the
  // production row needs the production key rather than whichever one
  // `.env.local` is currently in.
  if (process.env.BACKFILL_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.BACKFILL_SUPABASE_URL;
  }
  if (process.env.BACKFILL_SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.BACKFILL_SUPABASE_SERVICE_ROLE_KEY;
  }

  // USE_ENV_CREDENTIALS points integrations at Local WP. Reading production
  // rows while talking to a local store would flag every live commission as
  // deleted, so the encrypted production credentials win here.
  delete process.env.USE_ENV_CREDENTIALS;
}

/**
 * Removes Commission rows the platform still holds after SliceWP deleted them.
 *
 * SliceWP re-attributes an order by deleting the old commission and inserting a
 * new one for the correct affiliate. The sync upserts by `slicewpId` and has no
 * deletion pass, so the superseded row survives here and the same order revenue
 * is credited to two affiliates at once.
 *
 * `LedgerEntry.sourceCommission` is `onDelete: SetNull`, so dropping the
 * commission alone would leave a live unpaid ledger row pointing at nothing.
 * The ledger rows are deleted first, in the same transaction.
 *
 * SliceWP's side can come from either source:
 *   --remote-csv=FILE  lines of `id,affiliate_id,reference,type,status`, exported
 *                      straight from the SliceWP tables. Needed when the
 *                      encrypted production credentials cannot be decrypted
 *                      locally, which is the normal case off Vercel.
 *   (default)          the SliceWP REST API, using the credentials on the
 *                      database being read.
 *
 * Usage:
 *   npx tsx scripts/with-prod-supabase.ts scripts/prune-deleted-commissions.ts \
 *     --remote-csv=/tmp/slicewp-commissions.csv
 *   ALLOW_PRODUCTION_WRITES=true npx tsx scripts/with-prod-supabase.ts \
 *     scripts/prune-deleted-commissions.ts --remote-csv=... --apply
 *
 * Dry run by default: writes a JSON backup and deletes nothing.
 */

import { Prisma } from "@prisma/client";

/**
 * A truncated SliceWP response would make every unreturned commission look
 * deleted. Both guards must pass before anything is removed.
 */
const MIN_REMOTE_COMMISSIONS = 1_000;
const MAX_ORPHAN_SHARE = 0.05;

const APPLY = process.argv.includes("--apply");
const REMOTE_CSV = process.argv
  .find((arg) => arg.startsWith("--remote-csv="))
  ?.slice("--remote-csv=".length);
const BACKUP_PATH =
  process.argv.find((arg) => arg.startsWith("--backup="))?.slice("--backup=".length) ??
  "docs/reports/deleted-commission-prune.json";

const num = (value: Prisma.Decimal | number | null | undefined): number =>
  value instanceof Prisma.Decimal ? value.toNumber() : Number(value ?? 0);

const usd = (value: number): string =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type Orphan = {
  id: string;
  slicewpId: number;
  wooOrderId: number | null;
  type: string | null;
  status: string;
  amount: number;
  orderRevenue: number;
  dateCreated: string;
  affiliate: { slicewpId: number; name: string };
  /**
   * reattributed — SliceWP now pays this order to a different affiliate
   * replaced     — same affiliate, different commission id (a de-duplication)
   * voided       — SliceWP has no sale commission for this order at all
   */
  classification: "reattributed" | "replaced" | "voided";
  /** Sale commissions SliceWP still holds for this order. */
  supersededBy: Array<{ slicewpId: number; affiliateSlicewpId: number; status: string }>;
  ledgerEntries: Array<{
    id: string;
    type: string;
    status: string;
    amount: number;
    affiliateId: string;
    payoutBatchId: string | null;
    paidAt: string | null;
  }>;
  /** Paid or batched money is never touched by this script. */
  blockedReason: string | null;
};

async function main() {
  // Imported here, not at module scope: static imports are hoisted above the
  // BACKFILL_DATABASE_URL mapping, and lib/prisma reads DATABASE_URL on load.
  const { prisma } = await import("../lib/prisma");
  const { SLICEWP_LIFETIME_SALE_TYPE } = await import("../lib/affiliate/lifetime");

  /** Types SliceWP counts as referral sales, so a survivor here means re-attribution. */
  const SALE_TYPES = new Set([
    "sale",
    SLICEWP_LIFETIME_SALE_TYPE,
    "subscription",
    "recurring",
  ]);

  console.log(`mode:   ${APPLY ? "APPLY (will delete)" : "dry run (no writes)"}`);

  type RemoteCommission = {
    id: number;
    affiliateSlicewpId: number;
    reference: string;
    type: string;
    status: string;
  };

  let remote: RemoteCommission[];

  if (REMOTE_CSV) {
    console.log(`source: ${REMOTE_CSV}\n`);
    remote = readFileSync(REMOTE_CSV, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("id,"))
      .map((line) => {
        const [id, affiliateId, reference, type, status] = line.split(",");
        return {
          id: Number(id),
          affiliateSlicewpId: Number(affiliateId ?? 0),
          reference: (reference ?? "").trim(),
          type: (type ?? "").trim().toLowerCase(),
          status: (status ?? "").trim().toLowerCase(),
        };
      })
      .filter((row) => Number.isFinite(row.id) && row.id > 0);
    console.log(`  read ${remote.length.toLocaleString()} SliceWP commissions from file`);
  } else {
    const { getSettings, hasResolvedSliceWP } = await import("../lib/settings");
    const { fetchAllSliceWPCommissions } = await import("../lib/slicewp");

    const settings = await getSettings();
    if (!hasResolvedSliceWP(settings)) {
      throw new Error("SliceWP credentials are not configured for this database.");
    }

    // Diffing a production database against a local store would report every
    // live commission as deleted, so the two targets have to agree.
    if (
      process.env.BACKFILL_DATABASE_URL &&
      /\.local|localhost|127\.0\.0\.1/i.test(settings.wcStoreUrl)
    ) {
      throw new Error(
        `Refusing to continue: database is production but the store resolved to ` +
          `${settings.wcStoreUrl}. Comparing the two would flag every live ` +
          "commission as deleted. Pass --remote-csv=FILE instead."
      );
    }

    console.log(`source: ${settings.wcStoreUrl}\n`);
    console.log("fetching every commission from SliceWP...");
    const fetched = await fetchAllSliceWPCommissions(
      settings.wcStoreUrl,
      settings.slicewpConsumerKey,
      settings.slicewpConsumerSecret
    );
    remote = fetched.map((commission) => ({
      id: Number(commission.id),
      affiliateSlicewpId: Number(commission.affiliate_id ?? 0),
      reference: (commission.reference ?? "").trim(),
      type: (commission.type ?? "").toLowerCase(),
      status: (commission.status ?? "").toLowerCase(),
    }));
    console.log(`  SliceWP returned ${remote.length.toLocaleString()} commissions`);
  }

  if (remote.length < MIN_REMOTE_COMMISSIONS) {
    throw new Error(
      `Refusing to continue: SliceWP returned only ${remote.length} commissions, ` +
        `below the ${MIN_REMOTE_COMMISSIONS} floor. A truncated response would ` +
        "make live commissions look deleted."
    );
  }

  const remoteIds = new Set<number>();
  /** Live sale-type commissions keyed by order reference, for re-attribution lookup. */
  const liveSalesByOrder = new Map<
    string,
    Array<{ slicewpId: number; affiliateSlicewpId: number; status: string }>
  >();

  for (const commission of remote) {
    remoteIds.add(commission.id);

    if (!commission.reference) continue;
    if (!SALE_TYPES.has(commission.type)) continue;

    const list = liveSalesByOrder.get(commission.reference) ?? [];
    list.push({
      slicewpId: commission.id,
      affiliateSlicewpId: commission.affiliateSlicewpId,
      status: commission.status,
    });
    liveSalesByOrder.set(commission.reference, list);
  }

  console.log("loading portal commissions...");
  const local = await prisma.commission.findMany({
    select: {
      id: true,
      slicewpId: true,
      wooOrderId: true,
      type: true,
      status: true,
      amount: true,
      orderRevenue: true,
      dateCreated: true,
      affiliate: { select: { slicewpId: true, displayName: true, email: true } },
      ledgerEntries: {
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          affiliateId: true,
          payoutBatchId: true,
          paidAt: true,
        },
      },
    },
    orderBy: { slicewpId: "asc" },
  });
  console.log(`  portal holds ${local.length.toLocaleString()} commissions\n`);

  const orphans: Orphan[] = local
    .filter((row) => !remoteIds.has(row.slicewpId))
    .map((row) => {
      const ledgerEntries = row.ledgerEntries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        status: entry.status,
        amount: num(entry.amount),
        affiliateId: entry.affiliateId,
        payoutBatchId: entry.payoutBatchId,
        paidAt: entry.paidAt?.toISOString() ?? null,
      }));

      const paid = ledgerEntries.filter(
        (entry) => entry.status === "PAID" || entry.paidAt !== null
      );
      const batched = ledgerEntries.filter((entry) => entry.payoutBatchId !== null);

      const blockedReason =
        paid.length > 0
          ? `${paid.length} ledger entr${paid.length === 1 ? "y is" : "ies are"} already PAID`
          : batched.length > 0
            ? `${batched.length} ledger entr${batched.length === 1 ? "y is" : "ies are"} attached to a payout batch`
            : null;

      const liveForOrder =
        row.wooOrderId == null
          ? []
          : (liveSalesByOrder.get(String(row.wooOrderId)) ?? []).filter(
              (live) => live.slicewpId !== row.slicewpId
            );

      const classification: Orphan["classification"] =
        liveForOrder.length === 0
          ? "voided"
          : liveForOrder.some(
                (live) => live.affiliateSlicewpId !== row.affiliate.slicewpId
              )
            ? "reattributed"
            : "replaced";

      return {
        id: row.id,
        slicewpId: row.slicewpId,
        wooOrderId: row.wooOrderId,
        type: row.type,
        status: row.status,
        amount: num(row.amount),
        orderRevenue: num(row.orderRevenue),
        dateCreated: row.dateCreated.toISOString(),
        affiliate: {
          slicewpId: row.affiliate.slicewpId,
          name: row.affiliate.displayName ?? row.affiliate.email,
        },
        classification,
        supersededBy: liveForOrder,
        ledgerEntries,
        blockedReason,
      };
    });

  const share = local.length === 0 ? 0 : orphans.length / local.length;

  console.log("=".repeat(72));
  console.log(
    `ROWS SLICEWP NO LONGER HAS: ${orphans.length} of ${local.length.toLocaleString()} ` +
      `(${(share * 100).toFixed(2)}%)`
  );
  console.log("=".repeat(72));

  if (orphans.length === 0) {
    console.log("\nNothing to prune. Portal matches SliceWP.");
    await prisma.$disconnect();
    return;
  }

  if (share > MAX_ORPHAN_SHARE) {
    throw new Error(
      `Refusing to continue: ${(share * 100).toFixed(2)}% of commissions look deleted, ` +
        `above the ${(MAX_ORPHAN_SHARE * 100).toFixed(0)}% ceiling. That points at an ` +
        "incomplete SliceWP fetch rather than real deletions."
    );
  }

  const actionable = orphans.filter((row) => row.blockedReason === null);
  const blocked = orphans.filter((row) => row.blockedReason !== null);

  const reattributed = actionable.filter((row) => row.classification === "reattributed");
  const replaced = actionable.filter((row) => row.classification === "replaced");
  const voided = actionable.filter((row) => row.classification === "voided");

  console.log(`\n  re-attributed to another affiliate: ${reattributed.length}`);
  console.log(`  replaced for the same affiliate:    ${replaced.length}`);
  console.log(`  voided, no commission on the order: ${voided.length}`);
  console.log(`  BLOCKED (paid or batched):          ${blocked.length}`);

  // ---- per-affiliate impact ------------------------------------------------

  /** Commissions SliceWP still holds per affiliate, to spot fully purged accounts. */
  const remoteCountByAffiliate = new Map<number, number>();
  for (const commission of remote) {
    remoteCountByAffiliate.set(
      commission.affiliateSlicewpId,
      (remoteCountByAffiliate.get(commission.affiliateSlicewpId) ?? 0) + 1
    );
  }

  type Impact = {
    rows: number;
    revenue: number;
    commission: number;
    ledger: number;
    remaining: number;
  };
  const byAffiliate = new Map<string, Impact>();

  for (const row of actionable) {
    const key = `${row.affiliate.name} (#${row.affiliate.slicewpId})`;
    const current =
      byAffiliate.get(key) ?? {
        rows: 0,
        revenue: 0,
        commission: 0,
        ledger: 0,
        remaining: remoteCountByAffiliate.get(row.affiliate.slicewpId) ?? 0,
      };
    current.rows += 1;
    current.revenue += row.orderRevenue;
    current.commission += row.amount;
    // DIRECT is this affiliate's own commission; OVERRIDE belongs to their sponsor.
    current.ledger += row.ledgerEntries
      .filter((entry) => entry.type === "DIRECT")
      .reduce((sum, entry) => sum + entry.amount, 0);
    byAffiliate.set(key, current);
  }

  console.log(`\n${"-".repeat(72)}`);
  console.log("IMPACT BY AFFILIATE (rows that would be deleted)");
  console.log("-".repeat(72));
  console.log(
    `${"affiliate".padEnd(38)}${"rows".padStart(6)}${"sales".padStart(14)}${"own unpaid".padStart(14)}${"  left in SliceWP"}`
  );
  const purged: string[] = [];
  for (const [name, impact] of Array.from(byAffiliate.entries()).sort(
    (a, b) => b[1].revenue - a[1].revenue
  )) {
    if (impact.remaining === 0) purged.push(name);
    console.log(
      name.slice(0, 37).padEnd(38) +
        String(impact.rows).padStart(6) +
        usd(impact.revenue).padStart(14) +
        usd(impact.ledger).padStart(14) +
        String(impact.remaining).padStart(17) +
        (impact.remaining === 0 ? "  <-- fully purged" : "")
    );
  }

  if (purged.length > 0) {
    console.log(
      `\n  NOTE: ${purged.join(", ")} ${purged.length === 1 ? "has" : "have"} no commissions left in ` +
        "SliceWP at all. The platform is the only place still showing this balance."
    );
  }

  // ---- ledger exposure -----------------------------------------------------

  const ledgerByKind = new Map<string, { count: number; amount: number }>();
  let ledgerRows = 0;
  for (const row of actionable) {
    for (const entry of row.ledgerEntries) {
      ledgerRows += 1;
      const key = `${entry.type}/${entry.status}`;
      const current = ledgerByKind.get(key) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += entry.amount;
      ledgerByKind.set(key, current);
    }
  }

  console.log(`\n${"-".repeat(72)}`);
  console.log("LEDGER ENTRIES THAT WOULD BE DELETED");
  console.log("-".repeat(72));
  for (const [kind, value] of Array.from(ledgerByKind.entries()).sort()) {
    console.log(
      `  ${kind.padEnd(22)}${String(value.count).padStart(5)} entries${usd(value.amount).padStart(14)}`
    );
  }

  const totalRevenue = actionable.reduce((sum, row) => sum + row.orderRevenue, 0);
  const totalCommission = actionable.reduce((sum, row) => sum + row.amount, 0);

  console.log(`\n  phantom sales revenue removed: ${usd(totalRevenue)}`);
  console.log(`  phantom commission removed:    ${usd(totalCommission)}`);
  console.log(`  commission rows:               ${actionable.length}`);
  console.log(`  ledger rows:                   ${ledgerRows}`);

  if (blocked.length > 0) {
    console.log(`\n${"-".repeat(72)}`);
    console.log("SKIPPED — paid or batched, needs a manual decision");
    console.log("-".repeat(72));
    for (const row of blocked) {
      console.log(
        `  #${row.slicewpId} order=${row.wooOrderId ?? "-"} ${row.affiliate.name}: ${row.blockedReason}`
      );
    }
  }

  // ---- backup --------------------------------------------------------------

  mkdirSync(dirname(BACKUP_PATH), { recursive: true });
  writeFileSync(
    BACKUP_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        applied: APPLY,
        remoteSource: REMOTE_CSV ?? "slicewp-api",
        remoteCommissionCount: remote.length,
        localCommissionCount: local.length,
        totals: {
          orphans: orphans.length,
          actionable: actionable.length,
          blocked: blocked.length,
          reattributed: reattributed.length,
          replaced: replaced.length,
          voided: voided.length,
          revenueRemoved: totalRevenue,
          commissionRemoved: totalCommission,
          ledgerRowsRemoved: ledgerRows,
        },
        orphans,
      },
      null,
      2
    )
  );
  console.log(`\nbackup written: ${BACKUP_PATH}`);

  // ---- apply ---------------------------------------------------------------

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to delete these rows.");
    await prisma.$disconnect();
    return;
  }

  if (process.env.ALLOW_PRODUCTION_WRITES !== "true") {
    throw new Error("Refusing to write: set ALLOW_PRODUCTION_WRITES=true to apply.");
  }

  const commissionIds = actionable.map((row) => row.id);
  const ledgerIds = actionable.flatMap((row) =>
    row.ledgerEntries.map((entry) => entry.id)
  );

  console.log(
    `\napplying: deleting ${ledgerIds.length} ledger entries then ${commissionIds.length} commissions...`
  );

  const result = await prisma.$transaction(async (tx) => {
    // Ledger first: the FK is SetNull, so the reverse order would leave live
    // unpaid rows behind with no source commission.
    const ledger = await tx.ledgerEntry.deleteMany({
      where: { id: { in: ledgerIds } },
    });
    const commissions = await tx.commission.deleteMany({
      where: { id: { in: commissionIds } },
    });
    return { ledger: ledger.count, commissions: commissions.count };
  });

  console.log(`  deleted ${result.ledger} ledger entries`);
  console.log(`  deleted ${result.commissions} commissions`);
  console.log("\nDone. Re-run the team roster to confirm totals match SliceWP.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
