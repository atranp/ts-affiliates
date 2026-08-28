import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Exercises the two bridge routes M5 adds: referral link generation and
 * validated affiliate settings.
 *
 * Runs against a cohort affiliate only, and restores every value it changes.
 *
 * Usage: npm run m5-bridge-smoke
 */

import { assertTestAffiliate, isCohortEmail } from "./cohort";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}\n      ${detail}`);
}

async function main() {
  const { getSettings } = await import("../lib/settings");
  const { normalizeStoreUrl, appendWpAuthParams, sanitizeCredential } =
    await import("../lib/wordpress-auth");

  const settings = await getSettings();
  const baseUrl = normalizeStoreUrl(settings.wcStoreUrl);
  const key = sanitizeCredential(settings.slicewpConsumerKey);
  const secret = sanitizeCredential(settings.slicewpConsumerSecret);

  console.log(`store:      ${baseUrl}\n`);

  async function bridge<T>(
    path: string,
    init?: { method: "POST"; body: unknown }
  ): Promise<{ status: number; body: T }> {
    const search = appendWpAuthParams(new URLSearchParams(), key, secret);
    const response = await fetch(
      `${baseUrl}/wp-json/slicewp-ts/v1${path}${path.includes("?") ? "&" : "?"}${search}`,
      init
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(init.body),
          }
        : undefined
    );
    return { status: response.status, body: (await response.json()) as T };
  }

  // Pick a cohort affiliate so nothing real is touched.
  const { body: extras } = await bridge<
    Array<{ affiliate_id: number; custom_slug: string | null }>
  >("/affiliate-extras?include_coupons=0");

  const { fetchAllSliceWPAffiliates } = await import("../lib/slicewp");

  const affiliates = await fetchAllSliceWPAffiliates(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret
  );

  const cohortAffiliate = affiliates.find((affiliate) =>
    isCohortEmail(affiliate.payment_email)
  );

  if (!cohortAffiliate) {
    throw new Error(
      "No cohort affiliate found. Seed one first: npm run cohort seed"
    );
  }

  // Belt and braces: this script writes, so the guard runs even though the
  // record was selected by cohort email in the first place.
  assertTestAffiliate(cohortAffiliate);

  const slicewpId = Number(cohortAffiliate.id);
  const target = {
    id: slicewpId,
    slug:
      extras.find((row) => row.affiliate_id === slicewpId)?.custom_slug ?? null,
  };

  console.log(`using cohort affiliate #${target.id}\n`);

  // ---- link generation ----------------------------------------------------

  const home = await bridge<{ referral_url: string }>(
    `/affiliates/${target.id}/link`
  );

  record(
    "home referral link",
    home.status === 200 && home.body.referral_url.startsWith(baseUrl),
    home.body.referral_url
  );

  const deep = await bridge<{ referral_url: string }>(
    `/affiliates/${target.id}/link?url=${encodeURIComponent(`${baseUrl}/shop/`)}`
  );

  record(
    "landing page link keeps the path",
    deep.status === 200 &&
      deep.body.referral_url.includes("/shop") &&
      deep.body.referral_url !== home.body.referral_url,
    deep.body.referral_url
  );

  const offsite = await bridge<{ code?: string; message?: string }>(
    `/affiliates/${target.id}/link?url=${encodeURIComponent("https://example.com/x")}`
  );

  record(
    "off-site link is refused",
    offsite.status === 400 && offsite.body.code === "off_site_url",
    `${offsite.status} ${offsite.body.code} — ${offsite.body.message}`
  );

  // ---- settings validation ------------------------------------------------

  const numeric = await bridge<{ code?: string }>(
    `/affiliates/${target.id}/settings`,
    { method: "POST", body: { custom_slug: "12345" } }
  );

  record(
    "numeric slug is refused",
    numeric.status === 400 && numeric.body.code === "slug_numeric",
    `${numeric.status} ${numeric.body.code}`
  );

  const spaced = await bridge<{ code?: string }>(
    `/affiliates/${target.id}/settings`,
    { method: "POST", body: { custom_slug: "has spaces" } }
  );

  record(
    "slug with spaces is refused",
    spaced.status === 400 && spaced.body.code === "slug_invalid",
    `${spaced.status} ${spaced.body.code}`
  );

  // The collision that matters: another affiliate's slug would silently
  // redirect their clicks, because lookups resolve a single row.
  const taken = extras.find(
    (row) => row.custom_slug && row.affiliate_id !== target.id
  );

  if (taken?.custom_slug) {
    const conflict = await bridge<{ code?: string }>(
      `/affiliates/${target.id}/settings`,
      { method: "POST", body: { custom_slug: taken.custom_slug } }
    );

    record(
      "another affiliate's slug is refused",
      conflict.status === 409 && conflict.body.code === "slug_taken",
      `"${taken.custom_slug}" belongs to #${taken.affiliate_id} — ${conflict.status} ${conflict.body.code}`
    );
  } else {
    record("another affiliate's slug is refused", false, "no slug to collide with");
  }

  const badEmail = await bridge<{ code?: string }>(
    `/affiliates/${target.id}/settings`,
    { method: "POST", body: { payment_email: "not-an-email" } }
  );

  record(
    "invalid payment email is refused",
    badEmail.status === 400 && badEmail.body.code === "invalid_payment_email",
    `${badEmail.status} ${badEmail.body.code}`
  );

  // ---- a write that should succeed, then restore --------------------------

  const freshSlug = `tsm5${Date.now().toString(36).slice(-5)}`;

  const saved = await bridge<{
    custom_slug: string | null;
    referral_url: string;
    website: string | null;
  }>(`/affiliates/${target.id}/settings`, {
    method: "POST",
    body: { custom_slug: freshSlug, website: "https://example.com" },
  });

  record(
    "a valid slug saves and reshapes the referral link",
    saved.status === 200 &&
      saved.body.custom_slug === freshSlug &&
      saved.body.referral_url.includes(freshSlug),
    `${saved.body.custom_slug} → ${saved.body.referral_url}`
  );

  record(
    "website saves alongside it",
    saved.body.website === "https://example.com",
    `website=${saved.body.website}`
  );

  // Re-applying the same slug to the same affiliate must not trip uniqueness.
  const idempotent = await bridge<{ custom_slug: string | null }>(
    `/affiliates/${target.id}/settings`,
    { method: "POST", body: { custom_slug: freshSlug } }
  );

  record(
    "keeping your own slug is not a collision",
    idempotent.status === 200 && idempotent.body.custom_slug === freshSlug,
    `${idempotent.status} — still ${idempotent.body.custom_slug}`
  );

  const restored = await bridge<{ custom_slug: string | null }>(
    `/affiliates/${target.id}/settings`,
    { method: "POST", body: { custom_slug: target.slug ?? "", website: "" } }
  );

  console.log(
    `\n      restored slug to ${restored.body.custom_slug ?? "(none)"}`
  );

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) throw new Error(`${failed.length} check(s) failed.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
