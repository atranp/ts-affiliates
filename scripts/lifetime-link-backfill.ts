import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Backfills the customer → affiliate links that SliceWP's lifetime commissions
 * add-on reads, for affiliates named on the command line.
 *
 * Why this exists: lifetime does not reason about referral history. It reads one
 * row — `customer_meta.affiliate_id` — and returns early when it is missing. That
 * row is written by `slicewp_ltc_link_customer_on_purchase`, which ships inside
 * the add-on, so a site that has never run the add-on has never linked anybody.
 * Enabling it without this backfill pays nobody.
 *
 * Why it is safe to run long before the add-on is switched on: outside the
 * add-on, the only code in SliceWP that touches customer meta is
 * `slicewp_delete_customer`, and only to delete it. No affiliate-facing template
 * reads it, the platform mirror does not sync it, and this script talks to MySQL
 * directly rather than booting WordPress — so no hook fires, no mail is sent and
 * no notification is queued. Until the add-on is active the rows are inert.
 *
 * Dry run by default. Nothing is written without --apply.
 *
 * Usage:
 *   npx tsx scripts/lifetime-link-backfill.ts --affiliates=12,34,56
 *   npx tsx scripts/lifetime-link-backfill.ts --affiliates=12 --since=2026-08-17
 *   npx tsx scripts/lifetime-link-backfill.ts --affiliates=12 --out=backfill.sql
 *   npx tsx scripts/lifetime-link-backfill.ts --affiliates=12 --apply
 *
 * There is no --undo, because on production the rows this writes become
 * indistinguishable from the ones the add-on writes itself once it is running,
 * and a flag that cannot tell them apart is a way to delete real links. To
 * reverse a local run, name the affiliates explicitly:
 *
 *   DELETE FROM zww_slicewp_customer_meta
 *    WHERE meta_key = 'affiliate_id' AND meta_value IN ('12', '34');
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
const PREFIX = process.env.WP_TABLE_PREFIX ?? "zww_";

/**
 * Commission types that establish ownership of a customer.
 *
 * `inherit` is deliberately absent: it is the MLM override credited to a
 * sponsor, and letting it link would hand the sponsor a customer their downline
 * actually referred. This matches the add-on's own list in
 * `slicewp_ltc_link_customer_on_purchase`.
 */
const OWNERSHIP_TYPES = ["sale", "subscription", "recurring", "lead"];

/** A rejected commission is a referral that did not stand, so it grants nothing. */
const EXCLUDED_STATUSES = ["rejected"];

type Args = {
  affiliates: number[];
  since: string | null;
  apply: boolean;
  out: string | null;
};

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const get = (name: string): string | null => {
    const hit = raw.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };

  const affiliatesRaw = get("affiliates");

  if (!affiliatesRaw) {
    fail(
      "--affiliates is required. Name the affiliates deliberately; there is no default.",
      "Example: --affiliates=12,34,56"
    );
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

  return {
    affiliates,
    since,
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
    ["-u", USER, `-p${PASSWORD}`, "-S", SOCKET, "-N", DATABASE, "-e", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function one(sql: string): string {
  return query(sql)[0]?.[0] ?? "";
}

function quoteList(values: string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}

/**
 * Refuses to continue while the add-on is active.
 *
 * Backfilling into a live lifetime configuration would change who gets paid for
 * orders placed between the first insert and the last, which is exactly the
 * surprise this whole sequence exists to avoid.
 */
function assertAddOnInactive(): string {
  const activeAddOns = one(
    `SELECT option_value FROM ${PREFIX}options WHERE option_name = 'slicewp_active_add_ons'`
  );

  if (activeAddOns.includes("lifetime_commissions")) {
    fail(
      "The lifetime commissions add-on is ACTIVE on this database.",
      "Backfilling now would start changing commission attribution mid-run.",
      "Deactivate it, backfill, then re-activate."
    );
  }

  return activeAddOns;
}

type Candidate = {
  customerId: number;
  affiliateId: number;
  email: string;
  firstCommission: string;
  columnAffiliateId: number;
};

function findCandidates(args: Args): Candidate[] {
  const affiliateList = args.affiliates.join(", ");

  // `since` narrows the commissions considered *before* the first one is picked,
  // not after. "First referred by, on or after 8/17" means the earliest referral
  // in that window — not "customers whose very first order happened to fall in
  // it", which would exclude every established customer and is the opposite of
  // what a lifetime deal is for.
  const sinceClause = args.since
    ? `AND date_created >= '${args.since} 00:00:00'`
    : "";

  // Ties on timestamp fall back to insertion order, so the pick is stable across
  // runs and the same rows come out every time.
  const sql = `
    SELECT
      first.customer_id,
      first.affiliate_id,
      c.email,
      first.date_created,
      c.affiliate_id AS column_affiliate_id
    FROM (
      SELECT m.customer_id, m.affiliate_id, m.date_created
      FROM ${PREFIX}slicewp_commissions m
      INNER JOIN (
        SELECT customer_id, MIN(CONCAT(date_created, '#', LPAD(id, 20, '0'))) AS marker
        FROM ${PREFIX}slicewp_commissions
        WHERE customer_id > 0
          AND type   IN (${quoteList(OWNERSHIP_TYPES)})
          AND status NOT IN (${quoteList(EXCLUDED_STATUSES)})
          ${sinceClause}
        GROUP BY customer_id
      ) pick
        ON pick.customer_id = m.customer_id
       AND pick.marker = CONCAT(m.date_created, '#', LPAD(m.id, 20, '0'))
    ) first
    INNER JOIN ${PREFIX}slicewp_customers c
      ON c.id = first.customer_id
    LEFT JOIN ${PREFIX}slicewp_customer_meta meta
      ON meta.slicewp_customer_id = first.customer_id
     AND meta.meta_key = 'affiliate_id'
    WHERE first.affiliate_id IN (${affiliateList})
      AND meta.meta_id IS NULL
    ORDER BY first.affiliate_id, first.customer_id;
  `;

  return query(sql).map((row) => ({
    customerId: Number(row[0]),
    affiliateId: Number(row[1]),
    email: row[2],
    firstCommission: row[3],
    columnAffiliateId: Number(row[4]),
  }));
}

/**
 * Idempotent by construction: the guard travels with the statement, so the file
 * stays safe to re-run even if it is applied by hand somewhere else later.
 */
function toSql(candidate: Candidate): string {
  const { customerId, affiliateId } = candidate;

  return [
    `INSERT INTO ${PREFIX}slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)`,
    `SELECT ${customerId}, 'affiliate_id', '${affiliateId}' FROM DUAL`,
    `WHERE NOT EXISTS (SELECT 1 FROM ${PREFIX}slicewp_customer_meta`,
    `  WHERE slicewp_customer_id = ${customerId} AND meta_key = 'affiliate_id');`,
  ].join("\n");
}

function main() {
  const args = parseArgs();

  console.log("\nlifetime commissions — customer link backfill");
  console.log(`database ${DATABASE}, prefix ${PREFIX}`);
  console.log(
    `mode ${args.apply ? "APPLY (writes)" : "dry run (reads only)"}\n`
  );

  assertAddOnInactive();
  console.log("ok    lifetime add-on is inactive here — links stay inert\n");

  // SliceWP keeps no name of its own on the affiliate row — it belongs to the
  // linked WordPress user, so the join is what makes the output readable.
  const known = query(
    `SELECT a.id, COALESCE(u.display_name, '(no user)'), a.payment_email, a.status
       FROM ${PREFIX}slicewp_affiliates a
       LEFT JOIN ${PREFIX}users u ON u.ID = a.user_id
      WHERE a.id IN (${args.affiliates.join(", ")})`
  );

  if (known.length !== args.affiliates.length) {
    const found = new Set(known.map((row) => Number(row[0])));
    const missing = args.affiliates.filter((id) => !found.has(id));
    fail(`No such affiliate: ${missing.join(", ")}. Nothing was written.`);
  }

  console.log("targets");
  for (const [id, name, email, status] of known) {
    console.log(`  #${id}  ${name}  ${email}  (${status})`);
  }

  console.log(
    args.since
      ? `\nownership window: first qualifying commission on or after ${args.since}`
      : "\nownership window: all time (first qualifying commission ever)"
  );
  console.log(
    `qualifying types: ${OWNERSHIP_TYPES.join(", ")} — 'inherit' excluded so MLM overrides do not claim customers`
  );

  const candidates = findCandidates(args);

  if (candidates.length === 0) {
    console.log(
      [
        "",
        "Nothing to link — no customer matched.",
        "Either they are all linked already, or the filters excluded everyone:",
        `  window ${args.since ?? "all time"}`,
        `  affiliates ${args.affiliates.join(", ")}`,
        "A rejected-only or override-only commission history also yields nothing.",
        "",
      ].join("\n")
    );
    return;
  }

  const byAffiliate = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    const list = byAffiliate.get(candidate.affiliateId) ?? [];
    list.push(candidate);
    byAffiliate.set(candidate.affiliateId, list);
  }

  console.log("\ncustomers to link");
  const grouped = Array.from(byAffiliate.entries()).sort((a, b) => a[0] - b[0]);

  for (const [affiliateId, list] of grouped) {
    const name = known.find((row) => Number(row[0]) === affiliateId)?.[1] ?? "?";
    console.log(`  #${affiliateId}  ${name}  ${list.length}`);
    for (const candidate of list.slice(0, 3)) {
      console.log(
        `        ${candidate.email}  first commission ${candidate.firstCommission}`
      );
    }
    if (list.length > 3) console.log(`        … and ${list.length - 3} more`);
  }

  // SliceWP stamps the referring affiliate onto the customer row at creation and
  // never revises it, so it is an independent record of the same fact. Without a
  // window the two should agree; where they do not, the commission history and
  // the customer row tell different stories and a human should decide.
  //
  // With --since they are answering different questions — the column is all-time,
  // the query is windowed — so disagreement is expected rather than suspicious.
  const disagreements = candidates.filter(
    (candidate) =>
      candidate.columnAffiliateId > 0 &&
      candidate.columnAffiliateId !== candidate.affiliateId
  );

  console.log(
    `\ncross-check against ${PREFIX}slicewp_customers.affiliate_id: ${
      candidates.length - disagreements.length
    } agree, ${disagreements.length} disagree${
      args.since ? " (expected — the column is all-time, this run is windowed)" : ""
    }`
  );

  for (const candidate of disagreements.slice(0, 10)) {
    console.log(
      `  customer ${candidate.customerId} (${candidate.email}): history says #${candidate.affiliateId}, customer row says #${candidate.columnAffiliateId}`
    );
  }
  if (disagreements.length > 10) {
    console.log(`  … and ${disagreements.length - 10} more`);
  }

  const statements = candidates.map(toSql);
  const sql = [
    "-- SliceWP lifetime commissions: customer link backfill",
    `-- generated ${new Date().toISOString()}`,
    `-- affiliates ${args.affiliates.join(", ")}`,
    `-- window ${args.since ?? "all time"}`,
    `-- ${statements.length} statements, each a no-op if the link already exists`,
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
      [
        "",
        `dry run — nothing written. ${statements.length} links are ready.`,
        "Review the disagreements above, then re-run with --apply.",
        "",
      ].join("\n")
    );
    return;
  }

  // Only a blocker for an all-time run, where the two sources are answering the
  // same question and should never differ.
  if (disagreements.length > 0 && !args.since) {
    fail(
      `${disagreements.length} customers disagree with the customer row on an all-time run.`,
      "These two should never differ without a window, so something is off.",
      "Resolve them, or set --since to state the window deliberately.",
      "Nothing was written."
    );
  }

  execFileSync(
    MYSQL,
    ["-u", USER, `-p${PASSWORD}`, "-S", SOCKET, DATABASE, "-e", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

  const linked = one(
    `SELECT COUNT(*) FROM ${PREFIX}slicewp_customer_meta
      WHERE meta_key = 'affiliate_id'
        AND meta_value IN (${args.affiliates.map((id) => `'${id}'`).join(", ")})`
  );

  console.log(
    `\napplied. ${statements.length} statements ran; ${linked} customers now linked to these affiliates.`
  );
  console.log(
    "Nothing is visible to affiliates until the add-on is activated.\n"
  );
}

main();
