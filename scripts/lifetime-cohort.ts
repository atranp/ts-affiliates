import { config } from "dotenv";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Seeds Blair / Trin / Emmie-shaped mock affiliates on Local WordPress for
 * lifetime-commission testing. Shapes come from prod aggregates (Aug 2026);
 * volumes are scaled down, emails are @example.com.
 *
 * Usage:
 *   npm run lifetime-cohort seed
 *   npm run lifetime-cohort link        # customer→affiliate backfill (add-on off)
 *   npm run sync:local                  # mirror into local Supabase
 *   npm run lifetime-cohort rules       # Trin 10% override on Blair (platform)
 *   npm run lifetime-cohort portal      # Supabase logins + one-time invite links
 *   npm run lifetime-cohort enable-lifetime
 *   npm run lifetime-cohort list
 *   npm run lifetime-cohort teardown
 */

import { COHORT_DOMAIN } from "./cohort";

export const LTC_PREFIX = "ts-ltc";
export const LTC_META_KEY = "ts_lifetime_cohort";
export const LTC_META_VALUE = "1";
export const LTC_ORIGIN = "ts-ltc";

/** Matches prod: Trin team cut = Blair commission ÷ 3 (Gavin ops math). */
const LTC_OVERRIDE_RATE = 10;
const LTC_COMMISSION_DIVISOR = 3;

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
const MYSQL_USER = process.env.WP_MYSQL_USER ?? "root";
const MYSQL_PASSWORD = process.env.WP_MYSQL_PASSWORD ?? "root";
const PREFIX = process.env.WP_TABLE_PREFIX ?? "zww_";

type LifetimeMember = {
  slug: string;
  firstName: string;
  lastName: string;
  sponsor: string | null;
  saleRate: number;
  customSlug?: string;
  /** Unique customers with a single referred purchase. */
  oneOff: number;
  /** Customers with two referred purchases (lifetime test pool). */
  repeat: number;
  /** Typical order revenue / commission from prod averages. */
  avgRev: number;
  avgComm: number;
};

/**
 * Prod-shaped ratios, scaled-down counts. Prod refs (Aug 2026):
 * Trin #51 — 40%, slug Trin, 1278 customers, 76 repeat
 * Blair #81 — 30%, parent Trin, 2418 customers, 126 repeat
 * Emmie #138 — 30%, 378 customers, 19 repeat
 */
const MEMBERS: LifetimeMember[] = [
  {
    slug: "trin",
    firstName: "Trindalyn",
    lastName: "Mackenzie",
    sponsor: null,
    saleRate: 40,
    customSlug: "Trin",
    oneOff: 15,
    repeat: 5,
    avgRev: 102,
    avgComm: 40.8,
  },
  {
    slug: "blair",
    firstName: "Blair",
    lastName: "Rodgers",
    sponsor: "trin",
    saleRate: 30,
    oneOff: 18,
    repeat: 5,
    avgRev: 105,
    avgComm: 31.5,
  },
  {
    slug: "emmie",
    firstName: "Emmie",
    lastName: "Payton",
    sponsor: null,
    saleRate: 30,
    oneOff: 12,
    repeat: 3,
    avgRev: 122,
    avgComm: 36.6,
  },
];

type SliceWPAffiliateRow = {
  id: number | string;
  payment_email?: string;
  status?: string;
  parent_id?: number | string;
};

type SliceWPCommissionRow = {
  id: number | string;
  affiliate_id: number | string;
  customer_id?: number | string;
  amount?: string | number;
  status?: string;
  origin?: string;
  reference?: string;
  type?: string;
};

type SliceWPCustomerRow = {
  id: number | string;
  email?: string;
};

export function ltcEmailFor(slug: string): string {
  return `${LTC_PREFIX}-${slug}@${COHORT_DOMAIN}`;
}

export function ltcCustomerEmail(slug: string, index: number): string {
  return `${LTC_PREFIX}-cust-${slug}-${index}@${COHORT_DOMAIN}`;
}

export function isLifetimeCohortEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  return email.startsWith(`${LTC_PREFIX}-`) && email.endsWith(`@${COHORT_DOMAIN}`);
}

export function assertLifetimeCohortAffiliate(affiliate: {
  id: number | string;
  payment_email?: string | null;
}): void {
  if (isLifetimeCohortEmail(affiliate.payment_email)) return;

  throw new Error(
    [
      `Affiliate #${affiliate.id} (${affiliate.payment_email ?? "no payment email"}) is not part of the lifetime cohort.`,
      "Run: npm run lifetime-cohort seed",
    ].join(" ")
  );
}

function mysqlQuery(sql: string): string[][] {
  const out = execFileSync(
    MYSQL,
    [
      "-u",
      MYSQL_USER,
      `-p${MYSQL_PASSWORD}`,
      "-S",
      SOCKET,
      "-N",
      DATABASE,
      "-e",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function jitter(base: number, spread = 0.12): number {
  const factor = 1 + (Math.random() * 2 - 1) * spread;
  return Math.round(base * factor * 100) / 100;
}

function unpaidStatus(index: number, total: number): "paid" | "unpaid" {
  // ~6% unpaid — mirrors prod ratios for Blair/Trin/Emmie.
  const unpaidSlots = Math.max(1, Math.round(total * 0.06));
  return index < unpaidSlots ? "unpaid" : "paid";
}

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
      "Refusing to manage the lifetime cohort on production. Point WC_STORE_URL at Local WordPress."
    );
  }

  const settings = await getSettings();
  const creds = [
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
  ] as const;

  const findLifetimeAffiliates = async (): Promise<SliceWPAffiliateRow[]> => {
    const all = (await fetchAllSliceWPAffiliates(
      ...creds
    )) as unknown as SliceWPAffiliateRow[];

    return all.filter((affiliate) =>
      isLifetimeCohortEmail(affiliate.payment_email)
    );
  };

  const lifetimeCommissions = async (
    affiliateIds: Set<string>
  ): Promise<SliceWPCommissionRow[]> => {
    const all = (await fetchSliceWPCommissions(...creds, {
      number: "2000",
    })) as unknown as SliceWPCommissionRow[];

    return all.filter(
      (commission) =>
        commission.origin === LTC_ORIGIN
        || affiliateIds.has(String(commission.affiliate_id))
    );
  };

  if (command === "seed") {
    const existing = await findLifetimeAffiliates();
    const byEmail = new Map(
      existing.map((affiliate) => [affiliate.payment_email, affiliate])
    );

    const created = new Map<string, number>();
    const generation = Date.now().toString(36).slice(-5);

    for (const member of MEMBERS) {
      const email = ltcEmailFor(member.slug);
      const already = byEmail.get(email);

      if (already) {
        created.set(member.slug, Number(already.id));
        console.log(`reused  #${already.id}  ${email}`);
        continue;
      }

      const parentId = member.sponsor
        ? created.get(member.sponsor)
        : undefined;

      const meta: Record<string, string | number> = {
        [LTC_META_KEY]: LTC_META_VALUE,
        commission_rate_sale: member.saleRate,
        commission_rate_type_sale: "percentage",
      };

      if (member.customSlug) {
        meta.custom_slug = member.customSlug;
      }

      const affiliate = await slicewpWrite<SliceWPAffiliateRow>(
        "/affiliates/",
        "POST",
        {
          payment_email: email,
          status: "active",
          create_user: true,
          user_login: `${LTC_PREFIX}-${member.slug}-${generation}`,
          user_email: `${LTC_PREFIX}-wp-${member.slug}-${generation}@${COHORT_DOMAIN}`,
          user_first_name: member.firstName,
          user_last_name: member.lastName,
          ...(parentId ? { parent_id: parentId } : {}),
          meta_data: meta,
        }
      );

      created.set(member.slug, Number(affiliate.id));
      console.log(
        `created #${affiliate.id}  ${email}${parentId ? `  (sponsor #${parentId})` : ""}`
      );
    }

    console.log("");

    const stamp = Date.now();
    let commissionCount = 0;

    for (const member of MEMBERS) {
      const affiliateId = created.get(member.slug);
      if (!affiliateId) continue;

      const totalSales = member.oneOff + member.repeat * 2;
      let saleIndex = 0;

      for (let customerIndex = 1; customerIndex <= member.oneOff; customerIndex += 1) {
        const customer = await slicewpWrite<SliceWPCustomerRow>(
          "/customers/",
          "POST",
          {
            email: ltcCustomerEmail(member.slug, customerIndex),
            first_name: "QA",
            last_name: `${member.firstName} one-off ${customerIndex}`,
            affiliate_id: affiliateId,
          }
        );

        const revenue = jitter(member.avgRev);
        const amount = jitter(member.avgComm);
        const reference = `${LTC_ORIGIN}-${member.slug}-${stamp}-o${customerIndex}`;

        await slicewpWrite<SliceWPCommissionRow>("/commissions/", "POST", {
          affiliate_id: affiliateId,
          customer_id: Number(customer.id),
          amount,
          reference_amount: revenue,
          origin: LTC_ORIGIN,
          reference,
          type: "sale",
          status: unpaidStatus(saleIndex, totalSales),
        });

        saleIndex += 1;
        commissionCount += 1;
        console.log(
          `  sale #${commissionCount}  ${member.slug}  cust #${customer.id}  $${amount} / $${revenue}`
        );
      }

      for (
        let customerIndex = 1;
        customerIndex <= member.repeat;
        customerIndex += 1
      ) {
        const custNum = member.oneOff + customerIndex;
        const customer = await slicewpWrite<SliceWPCustomerRow>(
          "/customers/",
          "POST",
          {
            email: ltcCustomerEmail(member.slug, custNum),
            first_name: "QA",
            last_name: `${member.firstName} repeat ${customerIndex}`,
            affiliate_id: affiliateId,
          }
        );

        for (let order = 1; order <= 2; order += 1) {
          const revenue = jitter(member.avgRev);
          const amount = jitter(member.avgComm);
          const reference = `${LTC_ORIGIN}-${member.slug}-${stamp}-r${customerIndex}-${order}`;

          await slicewpWrite<SliceWPCommissionRow>("/commissions/", "POST", {
            affiliate_id: affiliateId,
            customer_id: Number(customer.id),
            amount,
            reference_amount: revenue,
            origin: LTC_ORIGIN,
            reference,
            type: "sale",
            status: unpaidStatus(saleIndex, totalSales),
          });

          saleIndex += 1;
          commissionCount += 1;
          console.log(
            `  repeat #${commissionCount}  ${member.slug}  cust #${customer.id}  order ${order}/2  $${amount} / $${revenue}`
          );
        }
      }
    }

    console.log(
      `\nSeeded ${commissionCount} commissions across ${MEMBERS.length} lifetime cohort affiliates.`
    );
    console.log("Next: npm run lifetime-cohort link");
    return;
  }

  if (command === "link") {
    const affiliates = await findLifetimeAffiliates();

    if (affiliates.length === 0) {
      throw new Error("Nothing to link. Run: npm run lifetime-cohort seed");
    }

    const ids = affiliates.map((row) => Number(row.id)).join(",");

    console.log(`Running customer link backfill for affiliate ids: ${ids}\n`);

    execFileSync(
      "npx",
      [
        "tsx",
        "scripts/lifetime-link-backfill.ts",
        `--affiliates=${ids}`,
        "--since=2025-08-17",
        "--apply",
      ],
      { stdio: "inherit", cwd: process.cwd() }
    );

    return;
  }

  if (command === "rules") {
    const { isProductionDatabase } = await import("../lib/env-guard");
    const { prisma } = await import("../lib/prisma");
    const { applyDealRuleRetroactively } = await import("../lib/rules-engine");
    const { DealBasis, DealRuleType } = await import("@prisma/client");

    if (isProductionDatabase()) {
      throw new Error(
        "Refusing to create deal rules in production. Switch to Mode C (local Supabase)."
      );
    }

    const rows = await prisma.affiliate.findMany({
      where: { email: { startsWith: `${LTC_PREFIX}-` } },
      select: { id: true, email: true, displayName: true, slicewpId: true },
    });

    const bySlug = new Map(
      rows.map((row) => [
        row.email.replace(`${LTC_PREFIX}-`, "").split("@")[0],
        row,
      ])
    );

    const trin = bySlug.get("trin");
    const blair = bySlug.get("blair");

    if (!trin || !blair) {
      throw new Error(
        "Lifetime cohort not mirrored yet. Run: npm run lifetime-cohort seed && npm run sync:local"
      );
    }

    const team = await prisma.team.findFirst({
      where: { sponsorAffiliateId: trin.id },
      select: { id: true, name: true },
    });

    if (!team) {
      throw new Error(
        `No downline team for ${trin.displayName ?? trin.email}. Run npm run sync:local first.`
      );
    }

    const existing = await prisma.dealRule.findFirst({
      where: {
        sponsorAffiliateId: trin.id,
        sourceAffiliateId: blair.id,
        type: DealRuleType.COMMISSION_OVERRIDE,
      },
      select: { id: true, teamId: true },
    });

    let ruleId: string;

    if (existing) {
      ruleId = existing.id;
      await prisma.dealRule.update({
        where: { id: ruleId },
        data: {
          teamId: team.id,
          basis: DealBasis.RECRUIT_COMMISSION,
          metadata: { commissionDivisor: LTC_COMMISSION_DIVISOR },
        },
      });
    } else {
      ruleId = (
        await prisma.dealRule.create({
          data: {
            name: `Lifetime QA — Trin ${LTC_OVERRIDE_RATE}% of Blair`,
            type: DealRuleType.COMMISSION_OVERRIDE,
            sponsorAffiliateId: trin.id,
            sourceAffiliateId: blair.id,
            teamId: team.id,
            ratePercent: LTC_OVERRIDE_RATE,
            basis: DealBasis.RECRUIT_COMMISSION,
            metadata: { commissionDivisor: LTC_COMMISSION_DIVISOR },
          },
          select: { id: true },
        })
      ).id;
    }

    const entries = await applyDealRuleRetroactively(ruleId);

    console.log(
      `${existing ? "reused " : "created"} rule ${ruleId}  Trin earns ${LTC_OVERRIDE_RATE}% of Blair via ${team.name}`
        + `  →  ${entries} override entries`
    );

    return;
  }

  if (command === "portal") {
    const { isProductionDatabase } = await import("../lib/env-guard");
    const { prisma } = await import("../lib/prisma");
    const { inviteAffiliateToPortal } = await import("../lib/admin/affiliate-portal");

    if (isProductionDatabase()) {
      throw new Error(
        "Refusing to create portal logins in production. Switch to Mode C."
      );
    }

    const rows = await prisma.affiliate.findMany({
      where: { email: { startsWith: `${LTC_PREFIX}-` } },
      orderBy: { email: "asc" },
      select: { id: true, email: true, displayName: true, slicewpId: true },
    });

    if (rows.length === 0) {
      throw new Error(
        "Lifetime cohort not mirrored. Run: npm run lifetime-cohort seed && npm run sync:local"
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    for (const affiliate of rows) {
      assertLifetimeCohortAffiliate({
        id: affiliate.slicewpId,
        payment_email: affiliate.email,
      });

      const result = await inviteAffiliateToPortal(
        affiliate.id,
        undefined,
        origin
      );

      console.log(`\n${affiliate.displayName ?? affiliate.email}`);
      console.log(`  profile: ${result.profileId}`);

      if (result.inviteLink) {
        console.log(`  link:    ${result.inviteLink}`);
      } else if (result.linked) {
        console.log("  already linked — use Admin → Reset portal access for a fresh link");
      }
    }

    return;
  }

  if (command === "enable-lifetime") {
    const affiliates = await findLifetimeAffiliates();

    if (affiliates.length === 0) {
      throw new Error("Nothing to enable. Run: npm run lifetime-cohort seed");
    }

    for (const affiliate of affiliates) {
      assertLifetimeCohortAffiliate(affiliate);

      const member = MEMBERS.find(
        (row) => ltcEmailFor(row.slug) === affiliate.payment_email
      );

      await slicewpWrite(`/affiliates/${affiliate.id}`, "PUT", {
        meta_data: {
          lifetime_commissions: "custom",
          commission_rate_lifetime_sale: member?.saleRate ?? 30,
          commission_rate_type_lifetime_sale: "percentage",
          commissions_lifetime_duration: "unlimited",
        },
      });

      console.log(
        `enabled lifetime (custom)  #${affiliate.id}  ${affiliate.payment_email}  @ ${member?.saleRate ?? 30}%`
      );
    }

    try {
      const activeAddOns = mysqlQuery(
        `SELECT option_value FROM ${PREFIX}options WHERE option_name = 'slicewp_active_add_ons'`
      )[0]?.[0];

      if (activeAddOns?.includes("lifetime_commissions")) {
        console.log("\nok    lifetime add-on is already active on Local WP");
      } else {
        console.log(
          "\nNote  Activate the Lifetime Commissions add-on once in Local WP:"
            + "\n      SliceWP → Add-ons → Lifetime Commissions → Activate"
            + "\n      Leave Settings → Enable Sitewide OFF — per-affiliate Custom handles the three mocks."
        );
      }
    } catch {
      console.log(
        "\nNote  Could not read Local MySQL (site may be stopped)."
          + " Activate the Lifetime Commissions add-on manually before testing naked repeat orders."
      );
    }

    console.log(
      "\nTest a naked repeat order for a linked repeat customer (no link, no coupon)."
    );

    return;
  }

  if (command === "list") {
    const affiliates = await findLifetimeAffiliates();

    if (affiliates.length === 0) {
      console.log("No lifetime cohort found. Run: npm run lifetime-cohort seed");
      return;
    }

    const ids = new Set(affiliates.map((row) => String(row.id)));
    const commissions = await lifetimeCommissions(ids);

    for (const affiliate of affiliates) {
      const owned = commissions.filter(
        (row) => String(row.affiliate_id) === String(affiliate.id)
      );
      const total = owned.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const repeatCustomers = new Set(
        owned
          .filter((row) => row.customer_id)
          .map((row) => String(row.customer_id))
      ).size;

      console.log(
        `#${String(affiliate.id).padEnd(5)} ${(affiliate.payment_email ?? "").padEnd(36)} ` +
          `parent=${affiliate.parent_id || "none"}  ` +
          `${owned.length} commissions  $${total.toFixed(2)}  ${repeatCustomers} customers w/ sales`
      );
    }

    try {
      const linked = mysqlQuery(
        `SELECT meta_value, COUNT(*) AS n FROM ${PREFIX}slicewp_customer_meta
          WHERE meta_key = 'affiliate_id'
            AND meta_value IN (${Array.from(ids).join(", ")})
          GROUP BY meta_value`
      );

      if (linked.length > 0) {
        console.log("\ncustomer links (lifetime backfill):");
        for (const [affiliateId, count] of linked) {
          console.log(`  affiliate #${affiliateId}: ${count} linked customers`);
        }
      }
    } catch {
      // Local MySQL unavailable — REST list above is still useful.
    }

    return;
  }

  if (command === "teardown") {
    const affiliates = await findLifetimeAffiliates();

    if (affiliates.length === 0) {
      console.log("Nothing to remove.");
      return;
    }

    const ids = new Set(affiliates.map((row) => String(row.id)));
    const commissions = await lifetimeCommissions(ids);

    for (const commission of commissions) {
      await slicewpWrite(`/commissions/${commission.id}`, "DELETE");
      console.log(`deleted commission #${commission.id}`);
    }

    try {
      const customerRows = mysqlQuery(
        `SELECT id FROM ${PREFIX}slicewp_customers
          WHERE email LIKE '${LTC_PREFIX}-cust-%@${COHORT_DOMAIN}'`
      );

      for (const [customerId] of customerRows) {
        await slicewpWrite(`/customers/${customerId}`, "DELETE");
        console.log(`deleted customer  #${customerId}`);
      }
    } catch {
      console.log(
        "Skipped customer cleanup — Local MySQL unavailable. Re-run teardown with the site up, or delete ts-ltc-cust-* customers in WP admin."
      );
    }

    for (const affiliate of affiliates) {
      await slicewpWrite(`/affiliates/${affiliate.id}`, "DELETE");
      console.log(`deleted affiliate  #${affiliate.id} ${affiliate.payment_email}`);
    }

    const { isProductionDatabase } = await import("../lib/env-guard");
    const { prisma } = await import("../lib/prisma");

    if (isProductionDatabase()) {
      console.log("\nSkipped mirror cleanup — DATABASE_URL points at production.");
    } else {
      const mirrored = await prisma.affiliate.findMany({
        where: { email: { startsWith: `${LTC_PREFIX}-` } },
        select: { id: true },
      });

      if (mirrored.length > 0) {
        const mirrorIds = mirrored.map((row) => row.id);

        const batches = await prisma.payoutBatch.deleteMany({
          where: { sponsorAffiliateId: { in: mirrorIds } },
        });

        await prisma.affiliate.deleteMany({ where: { id: { in: mirrorIds } } });

        console.log(
          `\nremoved ${mirrored.length} mirrored affiliate(s) and ${batches.count} payout batch(es)`
        );
      }
    }

    console.log(
      "\nRemoved. WordPress user accounts behind the affiliates are left in place."
    );

    return;
  }

  throw new Error(
    `Unknown command "${command}". Expected seed, link, rules, portal, enable-lifetime, list, or teardown.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
