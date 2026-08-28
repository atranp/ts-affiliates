import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Exercises the M2 write path against whatever store `.env.local` points at,
 * then restores the original values. Intended for Local WordPress only — the
 * production guard is asserted rather than bypassed.
 *
 * Runs against the seeded test cohort. An explicit ID may be passed, but it
 * still has to belong to the cohort — this script flips an affiliate's status
 * and payment email, which is not something to do to a real person's account.
 *
 * Usage: npx tsx scripts/m2-write-smoke.ts [slicewpAffiliateId]
 */

import { assertTestAffiliate, COHORT_PREFIX, emailFor } from "./cohort";

async function main() {
  const { updateSliceWPAffiliate, canWriteToStore } = await import(
    "../lib/slicewp-write"
  );
  const { fetchSliceWPAffiliateById, fetchAllSliceWPAffiliates } = await import(
    "../lib/slicewp"
  );
  const { getSettings } = await import("../lib/settings");
  const { isProductionStore, shouldMirrorWrites } = await import(
    "../lib/env-guard"
  );

  const { writable, storeUrl, reason } = await canWriteToStore();
  const settings = await getSettings();

  const resolveDefaultTarget = async (): Promise<number> => {
    const sponsorEmail = emailFor("sponsor");
    const all = await fetchAllSliceWPAffiliates(
      settings.wcStoreUrl,
      settings.slicewpConsumerKey,
      settings.slicewpConsumerSecret
    );
    const sponsor = all.find((a) => a.payment_email === sponsorEmail);

    if (!sponsor) {
      throw new Error(
        `Test cohort not found on this store. Seed it first: npx tsx scripts/test-cohort.ts seed`
      );
    }
    return Number(sponsor.id);
  };

  const slicewpId = process.argv[2]
    ? Number(process.argv[2])
    : await resolveDefaultTarget();

  const read = async () => {
    const affiliate = await fetchSliceWPAffiliateById(
      settings.wcStoreUrl,
      settings.slicewpConsumerKey,
      settings.slicewpConsumerSecret,
      slicewpId
    );
    if (!affiliate) throw new Error(`Affiliate ${slicewpId} not found`);
    return affiliate;
  };

  console.log(`store:      ${storeUrl}`);
  console.log(`production: ${isProductionStore(storeUrl)}`);
  console.log(`writable:   ${writable}${reason ? ` (${reason})` : ""}`);
  console.log(`mirrors db: ${shouldMirrorWrites(storeUrl)}`);

  if (!writable) {
    console.log("\nGuard blocked the write, as expected outside Mode B/C.");
    return;
  }

  if (isProductionStore(storeUrl)) {
    throw new Error("Refusing to run the smoke test against production.");
  }

  const before = await read();
  assertTestAffiliate(before);

  console.log(
    `\nbefore: status=${before.status} payment_email=${before.payment_email || "(empty)"} parent_id=${before.parent_id ?? 0}`
  );

  // Keeps the cohort prefix so the row stays recognisable if the script dies
  // between the write and the restore.
  const probeEmail = `${COHORT_PREFIX}-smoke-${Date.now()}@example.com`;

  // Commission rate meta is deliberately left alone: the REST affiliate
  // response does not echo it back, so the script cannot restore what it
  // overwrites. Verify rate changes through the admin UI instead.
  await updateSliceWPAffiliate(slicewpId, {
    status: "inactive",
    payment_email: probeEmail,
  });

  const after = await read();
  console.log(
    `after:  status=${after.status} payment_email=${after.payment_email || "(empty)"}`
  );

  const ok =
    after.status === "inactive" && after.payment_email === probeEmail;
  console.log(`\nwrite applied: ${ok ? "PASS" : "FAIL"}`);

  await updateSliceWPAffiliate(slicewpId, {
    status: before.status as "active",
    payment_email: before.payment_email ?? "",
  });

  const restored = await read();
  console.log(
    `restored: status=${restored.status} payment_email=${restored.payment_email || "(empty)"}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
