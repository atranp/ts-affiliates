import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Creates and removes a self-contained cohort of fake affiliates on the
 * configured SliceWP store, so development never operates on a real person's
 * account.
 *
 * The store must be non-production. `assertWritableStore()` inside the write
 * client enforces that, and this script refuses a second time before touching
 * anything, because the failure it prevents is unrecoverable.
 *
 * Usage:
 *   npm run cohort seed        create the affiliates and their commissions
 *   npm run cohort rules       add the sponsor's override rules (needs a sync first)
 *   npm run cohort list
 *   npm run cohort teardown
 *
 * `rules` is the only command that touches the platform database; the rest talk
 * to SliceWP alone. Run it after `npm run sync:local`, since the rules attach to
 * the mirrored affiliate rows rather than the SliceWP ones.
 */

import {
  COHORT_DOMAIN,
  COHORT_META_KEY,
  COHORT_META_VALUE,
  COHORT_ORIGIN,
  COHORT_PREFIX,
  emailFor,
  isCohortEmail,
} from "./cohort";

/**
 * Sponsor's cut of each recruit's commission. Deliberately not a round
 * fraction of the seeded amounts, so an override total that happens to match a
 * direct total is a real match rather than a coincidence.
 */
const COHORT_OVERRIDE_RATE = 10;

type CohortMember = {
  slug: string;
  firstName: string;
  lastName: string;
  /** Sponsor slug, or null for the top of the tree. */
  sponsor: string | null;
  /** Direct sales to create, as [commission, orderRevenue] pairs. */
  sales: Array<[number, number]>;
};

/**
 * A sponsor with two recruits: enough to exercise direct payouts, override
 * payouts, and the MLM parent chain, without the noise of a larger tree.
 */
const COHORT: CohortMember[] = [
  {
    slug: "sponsor",
    firstName: "Quinn",
    lastName: "Sponsor",
    sponsor: null,
    sales: [
      [30, 100],
      [45, 150],
    ],
  },
  {
    slug: "recruit-1",
    firstName: "Robin",
    lastName: "Recruit",
    sponsor: "sponsor",
    sales: [
      [30, 100],
      [60, 200],
      [22.5, 75],
    ],
  },
  {
    slug: "recruit-2",
    firstName: "Sam",
    lastName: "Recruit",
    sponsor: "sponsor",
    sales: [
      [36, 120],
      [15, 50],
    ],
  },
];

type SliceWPAffiliateRow = {
  id: number | string;
  payment_email?: string;
  status?: string;
  parent_id?: number | string;
  user_id?: number | string;
};

type SliceWPCommissionRow = {
  id: number | string;
  affiliate_id: number | string;
  amount?: string | number;
  status?: string;
  origin?: string;
  reference?: string;
};

async function main() {
  const command = process.argv[2] ?? "list";

  const { slicewpWrite, canWriteToStore } = await import("../lib/slicewp-write");
  const { isProductionStore } = await import("../lib/env-guard");
  const { getSettings } = await import("../lib/settings");
  const { fetchAllSliceWPAffiliates, fetchSliceWPCommissions } = await import(
    "../lib/slicewp"
  );

  const { writable, storeUrl, reason } = await canWriteToStore();

  console.log(`store:      ${storeUrl}`);
  console.log(`production: ${isProductionStore(storeUrl)}`);
  console.log(`writable:   ${writable}${reason ? ` (${reason})` : ""}\n`);

  if (isProductionStore(storeUrl)) {
    throw new Error(
      "Refusing to manage a test cohort on the production store. Point WC_STORE_URL at Local WordPress."
    );
  }

  const settings = await getSettings();
  const creds = [
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
  ] as const;

  const findCohortAffiliates = async (): Promise<SliceWPAffiliateRow[]> => {
    const all = (await fetchAllSliceWPAffiliates(
      ...creds
    )) as unknown as SliceWPAffiliateRow[];

    return all.filter((affiliate) => isCohortEmail(affiliate.payment_email));
  };

  const cohortCommissions = async (
    affiliateIds: Set<string>
  ): Promise<SliceWPCommissionRow[]> => {
    const all = (await fetchSliceWPCommissions(...creds, {
      number: "1000",
    })) as unknown as SliceWPCommissionRow[];

    return all.filter(
      (commission) =>
        commission.origin === COHORT_ORIGIN
        || affiliateIds.has(String(commission.affiliate_id))
    );
  };

  if (command === "seed") {
    const existing = await findCohortAffiliates();
    const byEmail = new Map(
      existing.map((affiliate) => [affiliate.payment_email, affiliate])
    );

    const created = new Map<string, number>();

    // Teardown removes affiliates but leaves their WordPress accounts behind,
    // and `user_login` / `user_email` are globally unique, so a reseed would
    // collide. Only the WordPress-side identifiers carry this suffix;
    // `payment_email` stays stable because that is what identifies the cohort.
    const generation = Date.now().toString(36).slice(-5);

    for (const member of COHORT) {
      const email = emailFor(member.slug);
      const already = byEmail.get(email);

      if (already) {
        created.set(member.slug, Number(already.id));
        console.log(`reused  #${already.id}  ${email}`);
        continue;
      }

      const parentId = member.sponsor ? created.get(member.sponsor) : undefined;

      const affiliate = await slicewpWrite<SliceWPAffiliateRow>(
        "/affiliates/",
        "POST",
        {
          payment_email: email,
          status: "active",
          create_user: true,
          user_login: `${COHORT_PREFIX}-${member.slug}-${generation}`,
          user_email: `${COHORT_PREFIX}-${member.slug}-${generation}@${COHORT_DOMAIN}`,
          user_first_name: member.firstName,
          user_last_name: member.lastName,
          ...(parentId ? { parent_id: parentId } : {}),
          meta_data: { [COHORT_META_KEY]: COHORT_META_VALUE },
        }
      );

      created.set(member.slug, Number(affiliate.id));
      console.log(
        `created #${affiliate.id}  ${email}${parentId ? `  (sponsor #${parentId})` : ""}`
      );
    }

    console.log("");

    const stamp = Date.now();

    for (const member of COHORT) {
      const affiliateId = created.get(member.slug);
      if (!affiliateId) continue;

      for (let index = 0; index < member.sales.length; index += 1) {
        const [amount, revenue] = member.sales[index];
        const reference = `${COHORT_PREFIX}-${member.slug}-${stamp}-${index + 1}`;

        try {
          const commission = await slicewpWrite<SliceWPCommissionRow>(
            "/commissions/",
            "POST",
            {
              affiliate_id: affiliateId,
              amount,
              reference_amount: revenue,
              origin: COHORT_ORIGIN,
              reference,
              type: "sale",
              status: "unpaid",
            }
          );

          console.log(
            `commission #${commission.id}  affiliate #${affiliateId}  $${amount} on $${revenue}`
          );
        } catch (error) {
          console.error(
            `  failed for #${affiliateId}: ${error instanceof Error ? error.message : error}`
          );
        }
      }
    }

    console.log("\nSeeded. These are the only affiliates development should touch.");
    return;
  }

  if (command === "rules") {
    const { isProductionDatabase } = await import("../lib/env-guard");
    const { prisma } = await import("../lib/prisma");
    const { applyDealRuleRetroactively } = await import("../lib/rules-engine");
    const { DealBasis, DealRuleType } = await import("@prisma/client");

    if (isProductionDatabase()) {
      throw new Error(
        "Refusing to create deal rules in the production database. This step needs Mode C."
      );
    }

    const rows = await prisma.affiliate.findMany({
      where: { email: { startsWith: `${COHORT_PREFIX}-` } },
      select: { id: true, email: true, displayName: true, slicewpId: true },
    });

    const bySlug = new Map(
      rows.map((row) => [row.email.replace(`${COHORT_PREFIX}-`, "").split("@")[0], row])
    );
    const sponsor = bySlug.get("sponsor");

    if (!sponsor) {
      throw new Error(
        "Cohort not in the database yet. Seed it, then sync: npm run sync:local"
      );
    }

    // Override payouts are scoped by team — `buildUnpaidWhere` filters member
    // targets on `dealRule.teamId` — so a rule without one generates entries
    // that can never be paid. Sync builds this team from the SliceWP parent
    // tree, so it already exists by the time this runs.
    const team = await prisma.team.findFirst({
      where: { sponsorAffiliateId: sponsor.id },
      select: { id: true, name: true },
    });

    if (!team) {
      throw new Error(
        `No downline team for ${sponsor.displayName ?? sponsor.email}. Run npm run sync:local first.`
      );
    }

    for (const member of COHORT) {
      if (!member.sponsor) continue;

      const recruit = bySlug.get(member.slug);
      if (!recruit) continue;

      const existing = await prisma.dealRule.findFirst({
        where: {
          sponsorAffiliateId: sponsor.id,
          sourceAffiliateId: recruit.id,
          type: DealRuleType.COMMISSION_OVERRIDE,
        },
        select: { id: true, teamId: true },
      });

      let ruleId: string;

      if (existing) {
        ruleId = existing.id;
        if (existing.teamId !== team.id) {
          await prisma.dealRule.update({
            where: { id: ruleId },
            data: { teamId: team.id },
          });
        }
      } else {
        ruleId = (
          await prisma.dealRule.create({
            data: {
              name: `QA override — ${recruit.displayName ?? recruit.email}`,
              type: DealRuleType.COMMISSION_OVERRIDE,
              sponsorAffiliateId: sponsor.id,
              sourceAffiliateId: recruit.id,
              teamId: team.id,
              ratePercent: COHORT_OVERRIDE_RATE,
              basis: DealBasis.RECRUIT_COMMISSION,
            },
            select: { id: true },
          })
        ).id;
      }

      const entries = await applyDealRuleRetroactively(ruleId);

      console.log(
        `${existing ? "reused " : "created"} rule ${ruleId}  ${sponsor.displayName ?? "sponsor"} earns `
          + `${COHORT_OVERRIDE_RATE}% of ${recruit.displayName ?? recruit.email} via ${team.name}`
          + `  →  ${entries} override entries`
      );
    }

    return;
  }

  if (command === "list") {
    const affiliates = await findCohortAffiliates();

    if (affiliates.length === 0) {
      console.log("No test cohort found. Run: npx tsx scripts/test-cohort.ts seed");
      return;
    }

    const ids = new Set(affiliates.map((a) => String(a.id)));
    const commissions = await cohortCommissions(ids);

    for (const affiliate of affiliates) {
      const owned = commissions.filter(
        (c) => String(c.affiliate_id) === String(affiliate.id)
      );
      const total = owned.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

      console.log(
        `#${String(affiliate.id).padEnd(5)} ${(affiliate.payment_email ?? "").padEnd(34)} ` +
          `status=${(affiliate.status ?? "?").padEnd(8)} parent=${affiliate.parent_id || "none"}  ` +
          `${owned.length} commissions  $${total.toFixed(2)}`
      );
    }
    return;
  }

  if (command === "teardown") {
    const affiliates = await findCohortAffiliates();

    if (affiliates.length === 0) {
      console.log("Nothing to remove.");
      return;
    }

    const ids = new Set(affiliates.map((a) => String(a.id)));
    const commissions = await cohortCommissions(ids);

    for (const commission of commissions) {
      await slicewpWrite(`/commissions/${commission.id}`, "DELETE");
      console.log(`deleted commission #${commission.id}`);
    }

    for (const affiliate of affiliates) {
      await slicewpWrite(`/affiliates/${affiliate.id}`, "DELETE");
      console.log(`deleted affiliate  #${affiliate.id} ${affiliate.payment_email}`);
    }

    // The mirror has to go too. Sync never deletes affiliates it stops seeing,
    // so leaving these behind means a reseed lands on new SliceWP ids and the
    // old rows linger with their ledger and deal rules attached — and `rules`
    // then quietly rebinds nothing, because the stale sponsor still matches.
    const { isProductionDatabase } = await import("../lib/env-guard");
    const { prisma } = await import("../lib/prisma");

    if (isProductionDatabase()) {
      console.log(
        "\nSkipped the mirror: DATABASE_URL points at production, so there is nothing"
          + "\nof ours in it to remove."
      );
    } else {
      const mirrored = await prisma.affiliate.findMany({
        where: { email: { startsWith: `${COHORT_PREFIX}-` } },
        select: { id: true },
      });

      if (mirrored.length > 0) {
        const ids = mirrored.map((row) => row.id);

        // Batches reference the affiliate by a plain column rather than a
        // relation, so nothing cascades them.
        const batches = await prisma.payoutBatch.deleteMany({
          where: { sponsorAffiliateId: { in: ids } },
        });

        // Everything else hangs off the affiliate and cascades: ledger entries,
        // commissions, deal rules, teams, batch items.
        await prisma.affiliate.deleteMany({ where: { id: { in: ids } } });

        console.log(
          `\nremoved ${mirrored.length} mirrored affiliate(s) and ${batches.count} payout batch(es)`
        );
      }
    }

    console.log(
      "\nRemoved. The WordPress accounts behind them are left in place: deleting users is a"
        + "\nheavier operation than this script should own, and they are inert once the affiliate"
        + `\nrow is gone. A reseed creates fresh ones rather than reusing them.`
    );
    return;
  }

  throw new Error(`Unknown command "${command}". Expected seed, list, or teardown.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
