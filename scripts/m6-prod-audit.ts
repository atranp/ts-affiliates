import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Read-only survey of production before cutover.
 *
 * Answers the two questions that decide how big M6 actually is: what schema
 * production is missing, and how many affiliates can already log in.
 *
 * Takes the connection string as an argument rather than reading `.env.local`,
 * so pointing at production is always deliberate and never a side effect of
 * whichever mode the env file happens to be in.
 *
 * Usage:
 *   npx tsx scripts/m6-prod-audit.ts "postgresql://...:5432/postgres"
 *
 * Issues no writes. Every statement below is a SELECT.
 */

const url = process.argv[2];

if (!url) {
  console.error(
    "Pass the production DIRECT_URL as the first argument.\n" +
      'Example: npx tsx scripts/m6-prod-audit.ts "postgresql://...pooler.supabase.com:5432/postgres"'
  );
  process.exit(1);
}

if (!/supabase\.com|supabase\.co/.test(url)) {
  console.error("That does not look like a hosted Supabase URL. Refusing.");
  process.exit(1);
}

/** Everything M3, M4 and M5 added, in the order the milestones added it. */
const EXPECTED_TABLES = ["Visit", "Creative", "AffiliateCoupon"];

const EXPECTED_COLUMNS: Array<[table: string, column: string, milestone: string]> = [
  ["PayoutBatch", "writeBackStatus", "M3"],
  ["PayoutBatch", "slicewpPaymentId", "M3"],
  ["PayoutBatch", "settledAmount", "M3"],
  ["PayoutBatch", "settledAt", "M3"],
  ["PayoutBatch", "writeBackError", "M3"],
  ["PayoutBatch", "writeBackAttempts", "M3"],
  ["PayoutBatch", "writeBackAttemptedAt", "M3"],
  ["Affiliate", "customSlug", "M4"],
  ["Affiliate", "referralUrl", "M4"],
  ["Affiliate", "storeCreditBalance", "M4"],
  ["Settings", "lastVisitSyncedThrough", "M4"],
  ["Affiliate", "website", "M5"],
];

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  console.log(`\nauditing ${url.replace(/:[^:@]+@/, ":****@")}\n`);

  // ---- schema drift --------------------------------------------------------

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `;

  const tableNames = new Set(tables.map((row) => row.table_name));

  const columns = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `;

  const columnKeys = new Set(
    columns.map((row) => `${row.table_name}.${row.column_name}`)
  );

  console.log("── schema ──────────────────────────────────────────────");

  const missingTables = EXPECTED_TABLES.filter((name) => !tableNames.has(name));
  const missingColumns = EXPECTED_COLUMNS.filter(
    ([table, column]) => !columnKeys.has(`${table}.${column}`)
  );

  for (const name of EXPECTED_TABLES) {
    console.log(
      `  ${tableNames.has(name) ? "present" : "MISSING"}  table  ${name}`
    );
  }

  for (const [table, column, milestone] of EXPECTED_COLUMNS) {
    const present = columnKeys.has(`${table}.${column}`);
    console.log(
      `  ${present ? "present" : "MISSING"}  ${milestone}     ${table}.${column}`
    );
  }

  // ---- who can actually log in --------------------------------------------

  console.log("\n── portal access ───────────────────────────────────────");

  const [affiliates] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "Affiliate"
  `;

  const [active] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "Affiliate" WHERE status = 'ACTIVE'
  `;

  const [linked] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT a.id)::bigint AS count
    FROM "Affiliate" a
    JOIN "Profile" p ON p."affiliateId" = a.id
  `;

  // The population that actually matters: affiliates who earned recently.
  // Onboarding a dormant affiliate has no urgency.
  const [earningRecently] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT l."affiliateId")::bigint AS count
    FROM "LedgerEntry" l
    WHERE l."occurredAt" >= NOW() - INTERVAL '90 days'
  `;

  const [earningRecentlyWithLogin] = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`
    SELECT COUNT(DISTINCT l."affiliateId")::bigint AS count
    FROM "LedgerEntry" l
    JOIN "Profile" p ON p."affiliateId" = l."affiliateId"
    WHERE l."occurredAt" >= NOW() - INTERVAL '90 days'
  `;

  const total = Number(affiliates.count);
  const withLogin = Number(linked.count);
  const recent = Number(earningRecently.count);
  const recentWithLogin = Number(earningRecentlyWithLogin.count);

  console.log(`  affiliates mirrored            ${total}`);
  console.log(`  status ACTIVE                  ${Number(active.count)}`);
  console.log(`  have a portal login            ${withLogin}`);
  console.log(`  need onboarding                ${total - withLogin}`);
  console.log(`\n  earned in the last 90 days     ${recent}`);
  console.log(`    ...of those, can log in      ${recentWithLogin}`);
  console.log(`    ...of those, need onboarding ${recent - recentWithLogin}`);

  // ---- outstanding write-backs, if M3 ever ran here ------------------------

  if (columnKeys.has("PayoutBatch.writeBackStatus")) {
    const rows = await prisma.$queryRaw<
      Array<{ writeBackStatus: string; count: bigint }>
    >`
      SELECT "writeBackStatus", COUNT(*)::bigint AS count
      FROM "PayoutBatch" GROUP BY "writeBackStatus"
    `;
    console.log("\n── payout write-back state ─────────────────────────────");
    for (const row of rows) {
      console.log(`  ${row.writeBackStatus}  ${Number(row.count)}`);
    }
  }

  // ---- verdict -------------------------------------------------------------

  console.log("\n── what this means ─────────────────────────────────────");

  if (missingTables.length || missingColumns.length) {
    console.log(
      `  Schema is behind by ${missingTables.length} table(s) and ${missingColumns.length} column(s).`
    );
    console.log(
      "  Deploying current code before applying these will break production:"
    );
    console.log(
      "  every query selecting them errors, including the admin dashboard."
    );
  } else {
    console.log("  Schema is up to date. Code can be deployed.");
  }

  console.log(
    `\n  ${recent - recentWithLogin} recently-earning affiliate(s) would need a login before a redirect.`
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
