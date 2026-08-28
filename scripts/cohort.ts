/**
 * Identity of the seeded test cohort, shared by the seeder and by any script
 * that mutates an affiliate.
 *
 * Development mutates live-looking records on Local WordPress, and that copy is
 * restored from production, so a real affiliate is only ever one mistyped ID
 * away. Every mutating script routes its target through `assertTestAffiliate()`
 * so the mistake fails loudly instead of silently editing someone's account.
 */

/**
 * `example.com` is reserved by RFC 2606 and can never receive mail, so even a
 * misrouted notification has nowhere to land.
 */
export const COHORT_DOMAIN = "example.com";
export const COHORT_PREFIX = "ts-qa";

/** Written to affiliate meta so teardown can identify its own rows exactly. */
export const COHORT_META_KEY = "ts_test_cohort";
export const COHORT_META_VALUE = "1";

/** Distinguishes seeded commissions from anything SliceWP created itself. */
export const COHORT_ORIGIN = "ts-qa";

export function emailFor(slug: string): string {
  return `${COHORT_PREFIX}-${slug}@${COHORT_DOMAIN}`;
}

export function isCohortEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (
    email.startsWith(`${COHORT_PREFIX}-`) && email.endsWith(`@${COHORT_DOMAIN}`)
  );
}

/**
 * Throws unless the affiliate belongs to the seeded cohort.
 *
 * Checks the payment email rather than an ID allowlist because IDs shift every
 * time the cohort is torn down and reseeded, and a stale allowlist would start
 * pointing at whoever inherited the ID.
 */
export function assertTestAffiliate(affiliate: {
  id: number | string;
  payment_email?: string | null;
}): void {
  if (isCohortEmail(affiliate.payment_email)) return;

  throw new Error(
    [
      `Affiliate #${affiliate.id} (${affiliate.payment_email ?? "no payment email"}) is not part of the test cohort.`,
      "This looks like a real affiliate, so the script stopped before changing anything.",
      "Seed and use the cohort instead: npx tsx scripts/test-cohort.ts seed",
    ].join(" ")
  );
}
