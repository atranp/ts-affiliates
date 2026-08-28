import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });
// Loaded last and wins: this script only ever targets production, and
// `.env.local` is pointed at Local WordPress in Mode C. Pull it first with
// `npx vercel env pull .env.vercel-prod --environment=production`.
config({ path: ".env.vercel-prod", override: true });

/**
 * Measures how big the first production sync will actually be.
 *
 * The 300s ceiling on `/api/sync` was never tested against production volume —
 * local WordPress holds 92 affiliates to production's 209. A first sync that
 * cannot finish inside the limit is not a data-loss risk (the visit watermark
 * only advances after a committed write) but it would retry forever, which is
 * worse than a clean failure because nothing ever completes.
 *
 * Reads only: SELECTs against the platform database, GETs against SliceWP.
 *
 * Usage:
 *   npx tsx scripts/m6-prod-volume.ts "<prod DIRECT_URL>"
 */

const url = process.argv[2];

if (!url || !/supabase\.c/.test(url)) {
  console.error("Pass the production DIRECT_URL as the first argument.");
  process.exit(1);
}

// The stored credentials are encrypted with Vercel's key, which is not the one
// in `.env.local`. Set after dotenv so the env file cannot override it back.
if (process.env.PROD_ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = process.env.PROD_ENCRYPTION_SECRET;
}

async function main() {
  const { decryptOptional } = await import("../lib/encryption");
  const { normalizeStoreUrl, appendWpAuthParams, sanitizeCredential } =
    await import("../lib/wordpress-auth");

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: {
      wcStoreUrlEncrypted: true,
      slicewpConsumerKeyEncrypted: true,
      slicewpConsumerSecretEncrypted: true,
    },
  });

  // Same precedence as `lib/settings.ts`: the encrypted row wins, and a failed
  // decrypt falls through to the plain env var rather than erroring. On
  // production the row does not decrypt, so the env vars are what actually run.
  const pick = (encrypted: string | null | undefined, env: string | undefined) =>
    (decryptOptional(encrypted) ?? (env ?? "")).trim();

  const storeUrl = pick(settings?.wcStoreUrlEncrypted, process.env.WC_STORE_URL);
  const key = pick(
    settings?.slicewpConsumerKeyEncrypted,
    process.env.SLICEWP_CONSUMER_KEY
  );
  const secret = pick(
    settings?.slicewpConsumerSecretEncrypted,
    process.env.SLICEWP_CONSUMER_SECRET
  );

  if (!storeUrl || !key || !secret) {
    throw new Error(
      "No usable production SliceWP credentials from either the settings row or env."
    );
  }

  // `vercel env pull` writes this placeholder for variables marked sensitive,
  // which are write-only and cannot be read back. Fail loudly rather than
  // firing requests with a literal "[SENSITIVE]" as the key.
  if ([storeUrl, key, secret].some((value) => value.includes("[SENSITIVE]"))) {
    throw new Error(
      "Credentials came back as [SENSITIVE]. Vercel cannot export these; " +
        "supply a SliceWP key directly via SLICEWP_CONSUMER_KEY/SECRET instead."
    );
  }

  const base = normalizeStoreUrl(storeUrl);
  console.log(`\nstore: ${base}\n`);

  async function count(path: string, extra: Record<string, string> = {}) {
    // Walk pages rather than trusting a total header SliceWP does not send.
    const pageSize = 1000;
    let offset = 0;
    let total = 0;
    const started = Date.now();

    while (true) {
      const params = new URLSearchParams({
        ...extra,
        offset: String(offset),
        number: String(pageSize),
      });
      appendWpAuthParams(params, sanitizeCredential(key!), sanitizeCredential(secret!));

      const response = await fetch(`${base}/wp-json/slicewp/v1${path}?${params}`);
      if (!response.ok) {
        throw new Error(`${path} → ${response.status} ${await response.text()}`);
      }

      const body = await response.json();
      const rows = Array.isArray(body) ? body : [body];
      total += rows.length;

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    return { total, seconds: (Date.now() - started) / 1000 };
  }

  const visits = await count("/visits/");
  console.log(`visits            ${visits.total.toLocaleString()}`);
  console.log(`  fetched in      ${visits.seconds.toFixed(1)}s (from this machine)`);

  const converted = await count("/visits/", { converted: "true" });
  console.log(`  of those, converted ${converted.total.toLocaleString()}`);

  const [affiliates, commissions] = await Promise.all([
    prisma.affiliate.count(),
    prisma.commission.count(),
  ]);

  console.log(`\naffiliates        ${affiliates}`);
  console.log(`commissions       ${commissions.toLocaleString()}`);

  console.log("\n── first-sync outlook ──────────────────────────────────");
  console.log(`  visit fetch waves   ${Math.ceil(visits.total / 5000)} (1000/page, 5 parallel)`);
  console.log(`  bulk write batches  ${Math.ceil(visits.total / 2000)} (2000 rows each)`);
  console.log(
    `  local comparison    32,879 visits / 92 affiliates finished a full sync in ~17s`
  );
  console.log(
    `\n  Vercel /api/sync maxDuration is 300s. Fetch above was measured from`
  );
  console.log(
    `  this machine, not Vercel, and excludes writes to hosted Postgres.`
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
