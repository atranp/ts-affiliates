import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Reclassifies historical SliceWP commission rows as `lifetime_sale` when they
 * match the repeat-customer lifetime deal — display/history only by default.
 *
 * This is NOT the customer-link backfill (`lifetime-link-backfill`). That wrote
 * dormant customer_meta rows. This changes `commissions.type` on rows that already
 * exist.
 *
 * What it does NOT do:
 * - Create new commissions or change amounts (unless you add --recalculate-rates,
 *   which this script deliberately omits — Gavin's payment backfill is separate)
 * - Prove an order had no coupon (SliceWP does not store that on the commission)
 *
 * Strict mode (default): repeat sale/subscription, visit_id = 0, on/after --since,
 * customer linked to the affiliate via customer_meta, status = unpaid only.
 * Paid history is left unchanged so settled payouts are not relabeled.
 *
 * Usage:
 *   npx tsx scripts/lifetime-type-backfill.ts --affiliates=126
 *   npx tsx scripts/lifetime-type-backfill.ts --affiliates=126 --since=2025-08-17 --apply
 *   npx tsx scripts/lifetime-type-backfill.ts --affiliates=126 --mode=all-repeats
 *
 * After apply on local: npm run sync:local
 */

import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const MYSQL =
  process.env.WP_MYSQL_BIN ??
  join(
    homedir(),
    "Library/Application Support/Local/lightning-services",
    "mysql-8.4.0/bin/darwin-arm64/bin/mysql"
  );

const SOCKET =
  process.env.WP_MYSQL_SOCKET ??
  join(
    homedir(),
    "Library/Application Support/Local/run/CSuFeBXEl/mysql/mysqld.sock"
  );

const DATABASE = process.env.WP_MYSQL_DATABASE ?? "local";
const USER = process.env.WP_MYSQL_USER ?? "root";
const PASSWORD = process.env.WP_MYSQL_PASSWORD ?? "root";
const HOST = process.env.WP_MYSQL_HOST ?? null;
const PREFIX = process.env.WP_TABLE_PREFIX ?? "zww_";

/** Only reclassify open commissions — paid rows stay as-is for payout history. */
const TARGET_STATUS = "unpaid";

function mysqlBaseArgs(): string[] {
  const args = ["-u", USER, `-p${PASSWORD}`, "-N", DATABASE];
  if (HOST) {
    args.splice(0, 0, "-h", HOST);
  } else {
    args.splice(2, 0, "-S", SOCKET);
  }
  return args;
}

type Mode = "strict" | "all-repeats";

type Args = {
  affiliates: number[];
  since: string | null;
  mode: Mode;
  apply: boolean;
  out: string | null;
};

type Candidate = {
  id: number;
  affiliateId: number;
  customerId: number;
  reference: string;
  visitId: number;
  dateCreated: string;
  amount: string;
  email: string;
};

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const get = (name: string): string | null => {
    const hit = raw.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };

  const affiliatesRaw = get("affiliates");
  if (!affiliatesRaw) {
    fail("--affiliates is required.");
  }

  const affiliates = affiliatesRaw!.split(",").map((value) => {
    const id = Number(value.trim());
    if (!Number.isInteger(id) || id <= 0) {
      fail(`"${value}" is not a valid affiliate id.`);
    }
    return id;
  });

  const since = get("since");
  if (since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    fail(`--since must look like YYYY-MM-DD, got "${since}".`);
  }

  const modeRaw = get("mode") ?? "strict";
  if (modeRaw !== "strict" && modeRaw !== "all-repeats") {
    fail(`--mode must be "strict" or "all-repeats", got "${modeRaw}".`);
  }

  return {
    affiliates,
    since,
    mode: modeRaw as Mode,
    apply: raw.includes("--apply"),
    out: get("out"),
  };
}

function fail(...lines: string[]): never {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

function query(sql: string): string[][] {
  const out = execFileSync(
    MYSQL,
    [...mysqlBaseArgs(), "-e", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function execSql(sql: string): void {
  execFileSync(MYSQL, [...mysqlBaseArgs(), "-e", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function findCandidates(args: Args): Candidate[] {
  const affiliateList = args.affiliates.join(", ");
  const sinceClause = args.since
    ? `AND c.date_created >= '${args.since} 00:00:00'`
    : "";
  const visitClause =
    args.mode === "strict" ? "AND c.visit_id = 0" : "";

  const sql = `
    SELECT
      c.id,
      c.affiliate_id,
      c.customer_id,
      c.reference,
      c.visit_id,
      c.date_created,
      c.amount,
      COALESCE(cu.email, '')
    FROM ${PREFIX}slicewp_commissions c
    INNER JOIN ${PREFIX}slicewp_customer_meta cm
      ON cm.slicewp_customer_id = c.customer_id
     AND cm.meta_key = 'affiliate_id'
     AND CAST(cm.meta_value AS UNSIGNED) = c.affiliate_id
    LEFT JOIN ${PREFIX}slicewp_customers cu ON cu.id = c.customer_id
    WHERE c.affiliate_id IN (${affiliateList})
      AND c.type IN ('sale', 'subscription')
      AND c.status = '${TARGET_STATUS}'
      AND c.customer_id > 0
      ${sinceClause}
      ${visitClause}
      AND EXISTS (
        SELECT 1
        FROM ${PREFIX}slicewp_commissions earlier
        WHERE earlier.affiliate_id = c.affiliate_id
          AND earlier.customer_id = c.customer_id
          AND earlier.id <> c.id
          AND earlier.date_created < c.date_created
          AND earlier.type IN ('sale', 'subscription', 'recurring', 'lead')
          AND earlier.status NOT IN ('rejected')
      )
    ORDER BY c.affiliate_id, c.customer_id, c.date_created, c.id;
  `;

  return query(sql).map((row) => ({
    id: Number(row[0]),
    affiliateId: Number(row[1]),
    customerId: Number(row[2]),
    reference: row[3] ?? "",
    visitId: Number(row[4] ?? 0),
    dateCreated: row[5] ?? "",
    amount: row[6] ?? "0",
    email: row[7] ?? "",
  }));
}

function toSql(id: number): string {
  return [
    `UPDATE ${PREFIX}slicewp_commissions`,
    `SET type = 'lifetime_sale'`,
    `WHERE id = ${id}`,
    `  AND status = '${TARGET_STATUS}'`,
    `  AND type IN ('sale', 'subscription');`,
  ].join("\n");
}

function main() {
  const args = parseArgs();

  console.log("\nlifetime commissions — type backfill (sale → lifetime_sale)");
  console.log(`database ${DATABASE}, prefix ${PREFIX}`);
  console.log(
    `mode ${args.apply ? "APPLY (writes)" : "dry run (reads only)"}`
  );
  console.log(
    `criteria ${args.mode === "strict" ? "repeat + visit_id=0" : "all repeats"}, status=${TARGET_STATUS} only`
  );
  console.log(
    args.since
      ? `window on/after ${args.since}`
      : "window all time"
  );
  console.log("amounts unchanged — type label only\n");

  const candidates = findCandidates(args);

  if (candidates.length === 0) {
    console.log("Nothing to reclassify.\n");
    return;
  }

  const byAffiliate = new Map<number, Candidate[]>();
  for (const row of candidates) {
    const list = byAffiliate.get(row.affiliateId) ?? [];
    list.push(row);
    byAffiliate.set(row.affiliateId, list);
  }

  console.log("commissions to reclassify");
  for (const [affiliateId, list] of Array.from(byAffiliate.entries()).sort(
    (a, b) => a[0] - b[0]
  )) {
    console.log(`  #${affiliateId}  ${list.length}`);
    for (const row of list.slice(0, 3)) {
      console.log(
        `        #${row.id}  order ${row.reference}  ${row.email}  $${row.amount}  ${row.dateCreated}`
      );
    }
    if (list.length > 3) {
      console.log(`        … and ${list.length - 3} more`);
    }
  }

  const statements = candidates.map((row) => toSql(row.id));
  const sql = [
    "-- SliceWP lifetime commissions: type backfill (sale/subscription → lifetime_sale)",
    `-- generated ${new Date().toISOString()}`,
    `-- affiliates ${args.affiliates.join(", ")}`,
    `-- mode ${args.mode}`,
    `-- window ${args.since ?? "all time"}`,
    `-- ${statements.length} updates — unpaid only, amounts not touched`,
    "",
    "START TRANSACTION;",
    "",
    ...statements,
    "",
    "COMMIT;",
    "",
  ].join("\n");

  if (args.out) {
    writeFileSync(args.out, sql);
    console.log(`\nwrote ${statements.length} statements to ${args.out}`);
  }

  if (!args.apply) {
    console.log(
      `\ndry run — nothing written. ${statements.length} rows ready.`,
      "\nRe-run with --apply, then npm run sync:local on the platform.\n"
    );
    return;
  }

  execSql(sql);

  const counts = query(
    `SELECT affiliate_id, COUNT(*) FROM ${PREFIX}slicewp_commissions
      WHERE type = 'lifetime_sale' AND affiliate_id IN (${args.affiliates.join(", ")})
      GROUP BY affiliate_id`
  );

  console.log("\napplied. lifetime_sale counts by affiliate:");
  for (const [affiliateId, count] of counts) {
    console.log(`  #${affiliateId}  ${count}`);
  }
  console.log("\nnext: npm run sync:local\n");
}

main();
