import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Read-only discovery for M4. Reports the real shape of the data M4 mirrors,
 * so the schema is designed against what SliceWP actually returns rather than
 * what its docs imply.
 *
 * Touches nothing. Usage: npx tsx scripts/m4-probe.ts
 */

function preview(value: unknown, chars = 900): string {
  const json = JSON.stringify(value, null, 2) ?? "undefined";
  return json.length > chars ? `${json.slice(0, chars)}\n  …truncated` : json;
}

function heading(title: string) {
  console.log(`\n${"─".repeat(70)}\n${title}\n${"─".repeat(70)}`);
}

async function main() {
  const { getSettings } = await import("../lib/settings");
  const { appendWpAuthParams, normalizeStoreUrl, sanitizeCredential } =
    await import("../lib/wordpress-auth");

  const settings = await getSettings();
  const key = sanitizeCredential(settings.slicewpConsumerKey);
  const secret = sanitizeCredential(settings.slicewpConsumerSecret);

  if (!key || !secret) throw new Error("SliceWP credentials missing.");

  const baseUrl = normalizeStoreUrl(settings.wcStoreUrl);
  console.log(`store: ${baseUrl}`);

  async function get(path: string, params: Record<string, string> = {}) {
    const search = appendWpAuthParams(new URLSearchParams(params), key!, secret!);
    const response = await fetch(`${baseUrl}${path}?${search.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        error: `${response.status} ${await response.text().then((t) => t.slice(0, 300))}`,
      };
    }
    return response.json();
  }

  heading("CREATIVES (bridge) — default filter");
  const active = await get("/wp-json/slicewp-ts/v1/creatives");
  console.log(`count: ${Array.isArray(active) ? active.length : "n/a"}`);
  console.log(preview(Array.isArray(active) ? active[0] : active));

  console.log("\ninactive are excluded by default:");
  const inactive = await get("/wp-json/slicewp-ts/v1/creatives", {
    status: "inactive",
  });
  console.log(
    `status=inactive → ${Array.isArray(inactive) ? inactive.length : "n/a"}`
  );

  heading("AFFILIATE EXTRAS (new bulk endpoint) — timing + shape");
  const started = Date.now();
  const extras = await get("/wp-json/slicewp-ts/v1/affiliate-extras");
  const elapsed = Date.now() - started;

  if (!Array.isArray(extras)) {
    console.log(preview(extras));
    return;
  }

  console.log(`${extras.length} affiliates in ${elapsed}ms (one request)`);

  type Extra = {
    affiliate_id: number;
    custom_slug: string | null;
    referral_url: string;
    referral_url_custom_slug: string | null;
    store_credit_balance: number | null;
    currency: string;
    coupons: Array<{ code?: string; amount?: string; uses?: unknown }>;
  };

  const rows = extras as Extra[];
  const withSlug = rows.filter((r) => r.custom_slug);
  const withCoupons = rows.filter((r) => r.coupons.length > 0);
  const withCredit = rows.filter((r) => (r.store_credit_balance ?? 0) > 0);

  console.log(`with a custom slug:   ${withSlug.length}`);
  console.log(`with coupons:         ${withCoupons.length}`);
  console.log(`with store credit:    ${withCredit.length}`);

  console.log("\na row WITH a custom slug:");
  console.log(preview(withSlug[0]));

  console.log("\na row WITH coupons (the shape that was unverifiable before):");
  console.log(preview(withCoupons[0]));

  console.log("\na row with neither:");
  console.log(preview(rows.find((r) => !r.custom_slug && r.coupons.length === 0)));

  heading("AFFILIATE EXTRAS — affiliate_ids filter + include_coupons=0");
  const someId = withCoupons[0]?.affiliate_id ?? rows[0]?.affiliate_id;
  const filtered = await get("/wp-json/slicewp-ts/v1/affiliate-extras", {
    affiliate_ids: String(someId),
  });
  console.log(
    `affiliate_ids=${someId} → ${Array.isArray(filtered) ? filtered.length : "n/a"} row(s)`
  );

  const noCoupons = Date.now();
  const skipped = await get("/wp-json/slicewp-ts/v1/affiliate-extras", {
    include_coupons: "0",
  });
  console.log(
    `include_coupons=0 → ${Array.isArray(skipped) ? skipped.length : "n/a"} rows in ${Date.now() - noCoupons}ms`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.stack : error}`);
    process.exit(1);
  });
