import { config } from "dotenv";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Copies a production affiliate's SliceWP mirror data onto a local affiliate
 * row — commissions, affiliate meta, and customer→affiliate links — so the
 * local account shows the same SliceWP dashboard numbers as prod.
 *
 * Reads prod over SSH (tsprod). Writes Local MySQL only.
 *
 * Usage:
 *   npx tsx scripts/clone-prod-affiliate-to-local.ts --prod=81 --local=126
 *   npm run clone-prod-blair
 */

const PROD_SSH = "tsprod";
const PROD_WP = "~/www/true-sciences.com/public_html";

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

type Args = { prodId: number; localId: number; visitsOnly: boolean; linksOnly: boolean };

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const get = (name: string): string | null => {
    const hit = raw.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };

  const prodId = Number(get("prod"));
  const localId = Number(get("local"));

  if (!Number.isInteger(prodId) || prodId <= 0) {
    throw new Error("--prod=<slicewp affiliate id> is required");
  }
  if (!Number.isInteger(localId) || localId <= 0) {
    throw new Error("--local=<slicewp affiliate id> is required");
  }

  if (raw.includes("--visits-only") && raw.includes("--links-only")) {
    throw new Error("Use either --visits-only or --links-only, not both");
  }

  return {
    prodId,
    localId,
    visitsOnly: raw.includes("--visits-only"),
    linksOnly: raw.includes("--links-only"),
  };
}

function sqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function localQuery(sql: string): string[][] {
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

function localExec(sql: string): void {
  execFileSync(
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
}

function prodQuery(sql: string): string {
  const escaped = sql.replace(/"/g, '\\"');
  return execFileSync(
    "ssh",
    [PROD_SSH, `cd ${PROD_WP} && wp db query "${escaped}" --skip-column-names`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
}

type CommissionRow = {
  visitId: string;
  dateCreated: string;
  dateModified: string;
  type: string;
  status: string;
  reference: string;
  referenceAmount: string;
  origin: string;
  amount: string;
  parentId: string;
  paymentId: string;
  currency: string;
  customerEmail: string;
};

function parseCommissionRows(raw: string): CommissionRow[] {
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const cols = line.split("\t");
      return {
        visitId: cols[0] ?? "0",
        dateCreated: cols[1] ?? "",
        dateModified: cols[2] ?? "",
        type: cols[3] ?? "sale",
        status: cols[4] ?? "unpaid",
        reference: cols[5] ?? "",
        referenceAmount: cols[6] ?? "0",
        origin: cols[7] ?? "",
        amount: cols[8] ?? "0",
        parentId: cols[9] ?? "0",
        paymentId: cols[10] ?? "0",
        currency: cols[11] ?? "USD",
        customerEmail: cols[12] ?? "",
      };
    });
}

function ensureLocalCustomer(
  email: string,
  localAffiliateId: number,
  cache: Map<string, number>
): number {
  if (!email) return 0;

  const cached = cache.get(email.toLowerCase());
  if (cached !== undefined) return cached;

  const existing = localQuery(
    `SELECT id FROM ${PREFIX}slicewp_customers WHERE email = '${sqlEscape(email)}' LIMIT 1`
  );

  if (existing[0]?.[0]) {
    const id = Number(existing[0][0]);
    cache.set(email.toLowerCase(), id);
    return id;
  }

  localExec(
    `INSERT INTO ${PREFIX}slicewp_customers (user_id, email, first_name, last_name, affiliate_id, date_created, date_modified)
     VALUES (0, '${sqlEscape(email)}', '', '', ${localAffiliateId}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`
  );

  const created = localQuery(
    `SELECT id FROM ${PREFIX}slicewp_customers WHERE email = '${sqlEscape(email)}' LIMIT 1`
  );

  const id = Number(created[0]?.[0] ?? 0);
  cache.set(email.toLowerCase(), id);
  return id;
}

function copyAffiliateMeta(prodId: number, localId: number): number {
  const raw = prodQuery(
    `SELECT meta_key, meta_value FROM ${PREFIX}slicewp_affiliate_meta WHERE slicewp_affiliate_id = ${prodId}`
  );

  const rows = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));

  localExec(
    `DELETE FROM ${PREFIX}slicewp_affiliate_meta WHERE slicewp_affiliate_id = ${localId}`
  );

  let copied = 0;

  for (const [metaKey, metaValue] of rows) {
    if (!metaKey) continue;
    localExec(
      `INSERT INTO ${PREFIX}slicewp_affiliate_meta (slicewp_affiliate_id, meta_key, meta_value)
       VALUES (${localId}, '${sqlEscape(metaKey)}', '${sqlEscape(metaValue ?? "")}')`
    );
    copied += 1;
  }

  return copied;
}

function copyCustomerLinks(prodId: number, localId: number): number {
  const raw = prodQuery(
    `SELECT cu.email, cm.meta_value
     FROM ${PREFIX}slicewp_customer_meta cm
     JOIN ${PREFIX}slicewp_customers cu ON cu.id = cm.slicewp_customer_id
     WHERE cm.meta_key = 'affiliate_id' AND cm.meta_value = '${prodId}'`
  );

  const rows = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));

  localExec(
    `DELETE FROM ${PREFIX}slicewp_customer_meta
      WHERE meta_key = 'affiliate_id' AND meta_value = '${localId}'`
  );

  const cache = new Map<string, number>();
  let linked = 0;

  for (const [email] of rows) {
    if (!email) continue;

    const customerId = ensureLocalCustomer(email, localId, cache);
    if (!customerId) continue;

    localExec(
      `INSERT INTO ${PREFIX}slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
       VALUES (${customerId}, 'affiliate_id', '${localId}')`
    );

    linked += 1;
  }

  return linked;
}

function buildLocalCommissionRefMap(localId: number): Map<string, number> {
  const rows = localQuery(
    `SELECT reference, id FROM ${PREFIX}slicewp_commissions
      WHERE affiliate_id = ${localId} AND reference != ''`
  );

  const map = new Map<string, number>();
  for (const [reference, id] of rows) {
    if (reference) map.set(reference, Number(id));
  }
  return map;
}

type VisitRow = {
  dateCreated: string;
  dateModified: string;
  ipAddress: string;
  landingUrl: string;
  referrerUrl: string;
  commissionReference: string;
};

function copyVisits(
  prodId: number,
  localId: number,
  commissionRefMap: Map<string, number>
): number {
  localExec(`DELETE FROM ${PREFIX}slicewp_visits WHERE affiliate_id = ${localId}`);

  const raw = prodQuery(
    `SELECT v.date_created, v.date_modified, v.ip_address, v.landing_url, v.referrer_url,
            COALESCE(c.reference, '')
       FROM ${PREFIX}slicewp_visits v
       LEFT JOIN ${PREFIX}slicewp_commissions c ON c.id = v.commission_id
      WHERE v.affiliate_id = ${prodId}
      ORDER BY v.id`
  );

  const rows: VisitRow[] = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const cols = line.split("\t");
      return {
        dateCreated: cols[0] ?? "",
        dateModified: cols[1] ?? "",
        ipAddress: cols[2] ?? "",
        landingUrl: cols[3] ?? "",
        referrerUrl: cols[4] ?? "",
        commissionReference: cols[5] ?? "",
      };
    });

  console.log(`     ${rows.length} visit rows fetched`);

  const batchSize = 100;
  let inserted = 0;

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = batch
      .map((row) => {
        const commissionId = row.commissionReference
          ? commissionRefMap.get(row.commissionReference) ?? 0
          : 0;

        return (
          `(${localId}, '${sqlEscape(row.dateCreated)}', '${sqlEscape(row.dateModified)}', `
          + `'${sqlEscape(row.ipAddress)}', '${sqlEscape(row.landingUrl)}', `
          + `'${sqlEscape(row.referrerUrl)}', ${commissionId})`
        );
      })
      .join(",\n");

    localExec(
      `INSERT INTO ${PREFIX}slicewp_visits
        (affiliate_id, date_created, date_modified, ip_address, landing_url, referrer_url, commission_id)
       VALUES ${values}`
    );

    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === rows.length) {
      console.log(`     ${inserted}/${rows.length}`);
    }
  }

  return inserted;
}

async function clearPlatformMirror(localAffiliateEmail: string): Promise<void> {
  const { isProductionDatabase } = await import("../lib/env-guard");
  if (isProductionDatabase()) return;

  const { prisma } = await import("../lib/prisma");
  const row = await prisma.affiliate.findFirst({
    where: { email: localAffiliateEmail },
    select: { id: true },
  });

  if (!row) return;

  await prisma.payoutBatch.deleteMany({ where: { sponsorAffiliateId: row.id } });
  await prisma.ledgerEntry.deleteMany({ where: { affiliateId: row.id } });
  await prisma.commission.deleteMany({ where: { affiliateId: row.id } });
}

async function run() {
  const { prodId, localId, visitsOnly, linksOnly } = parseArgs();

  const localAffiliate = localQuery(
    `SELECT a.id, u.display_name, a.payment_email
       FROM ${PREFIX}slicewp_affiliates a
       JOIN ${PREFIX}users u ON u.ID = a.user_id
      WHERE a.id = ${localId}`
  );

  if (localAffiliate.length === 0) {
    throw new Error(`Local affiliate #${localId} not found`);
  }

  const [, name, paymentEmail] = localAffiliate[0];

  console.log(`\nclone prod #${prodId} → local #${localId} (${name}, ${paymentEmail})`);

  const prodSummary = prodQuery(
    `SELECT COUNT(*), ROUND(SUM(amount), 2)
     FROM ${PREFIX}slicewp_commissions
     WHERE affiliate_id = ${prodId} AND status IN ('paid', 'unpaid')`
  ).trim();

  console.log(`prod:  ${prodSummary.replace("\t", " commissions  $")}`);

  if (linksOnly) {
    console.log("\n1/1  customer links from prod…");
    const linkCount = copyCustomerLinks(prodId, localId);
    console.log(`\ndone  customer links copied: ${linkCount}`);
    console.log(`\nSliceWP login: https://true-sciences-04.local/affiliate-account/`);
    console.log(`  payment email on affiliate row: ${paymentEmail}`);
    return;
  }

  let metaCount = 0;
  let linkCount = 0;

  if (!visitsOnly) {
    console.log("\n1/5  clearing local commissions…");
    localExec(`DELETE FROM ${PREFIX}slicewp_commissions WHERE affiliate_id = ${localId}`);

    console.log("2/5  pulling prod commissions (this takes a moment)…");
    const raw = prodQuery(
      `SELECT c.visit_id, c.date_created, c.date_modified, c.type, c.status,
              c.reference, c.reference_amount, c.origin, c.amount, c.parent_id,
              c.payment_id, c.currency, COALESCE(cu.email, '')
         FROM ${PREFIX}slicewp_commissions c
         LEFT JOIN ${PREFIX}slicewp_customers cu ON cu.id = c.customer_id
        WHERE c.affiliate_id = ${prodId}
        ORDER BY c.id`
    );

    const rows = parseCommissionRows(raw);
    console.log(`     ${rows.length} rows fetched`);

    console.log("3/5  inserting commissions…");
    const customerCache = new Map<string, number>();
    const batchSize = 50;
    let inserted = 0;

    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const values = batch
        .map((row) => {
          const customerId = ensureLocalCustomer(
            row.customerEmail,
            localId,
            customerCache
          );

          return (
            `(${localId}, ${row.visitId || 0}, '${sqlEscape(row.dateCreated)}', '${sqlEscape(row.dateModified)}', `
            + `'${sqlEscape(row.type)}', '${sqlEscape(row.status)}', '${sqlEscape(row.reference)}', `
            + `'${sqlEscape(row.referenceAmount)}', ${customerId}, '${sqlEscape(row.origin)}', `
            + `'${sqlEscape(row.amount)}', ${row.parentId || 0}, ${row.paymentId || 0}, '${sqlEscape(row.currency || "USD")}')`
          );
        })
        .join(",\n");

      localExec(
        `INSERT INTO ${PREFIX}slicewp_commissions
          (affiliate_id, visit_id, date_created, date_modified, type, status, reference,
           reference_amount, customer_id, origin, amount, parent_id, payment_id, currency)
         VALUES ${values}`
      );

      inserted += batch.length;
      if (inserted % 500 === 0 || inserted === rows.length) {
        console.log(`     ${inserted}/${rows.length}`);
      }
    }

    console.log("4/5  affiliate meta + customer links…");
    metaCount = copyAffiliateMeta(prodId, localId);
    linkCount = copyCustomerLinks(prodId, localId);
  }

  console.log(visitsOnly ? "\n1/1  cloning visits…" : "\n5/5  cloning visits…");
  const commissionRefMap = buildLocalCommissionRefMap(localId);
  const visitCount = copyVisits(prodId, localId, commissionRefMap);

  const localSummary = localQuery(
    `SELECT COUNT(*), ROUND(SUM(amount), 2)
     FROM ${PREFIX}slicewp_commissions
     WHERE affiliate_id = ${localId} AND status IN ('paid', 'unpaid')`
  )[0];

  const localVisits = localQuery(
    `SELECT COUNT(*) FROM ${PREFIX}slicewp_visits WHERE affiliate_id = ${localId}`
  )[0]?.[0];

  console.log(
    `\ndone  local: ${localSummary?.[0]} commissions  $${localSummary?.[1]}`
  );
  console.log(`      visits: ${localVisits} (${visitCount} copied)`);
  console.log(`      meta keys copied: ${metaCount}`);
  console.log(`      customer links copied: ${linkCount}`);

  if (!visitsOnly) {
    console.log("\nclearing platform mirror for fresh sync…");
    await clearPlatformMirror(paymentEmail!);
  }

  console.log(`\nSliceWP login: https://true-sciences-04.local/affiliate-account/`);
  console.log(`  payment email on affiliate row: ${paymentEmail}`);
  console.log("\nnext: npm run sync:local");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
