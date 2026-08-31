import { config } from "dotenv";
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Places a naked repeat WooCommerce order on Local WordPress so mock Blair gets
 * a lifetime_sale commission through real SliceWP hooks. Never touches prod.
 *
 * Usage:
 *   npm run lifetime-demo-order
 *   npm run lifetime-demo-order -- --email=sambaxter02@hotmail.com
 */

const LOCAL_WP_LOAD =
  process.env.TS_WP_LOAD ??
  "/Users/anthonytran/Local Sites/true-sciences-04/app/public/wp-load.php";

const LOCAL_PHP =
  process.env.LOCAL_PHP_BIN ??
  join(
    homedir(),
    "Library/Application Support/Local/lightning-services/php-8.2.29+0/bin/darwin-arm64/bin/php"
  );

const LOCAL_MYSQL_SOCKET =
  process.env.WP_MYSQL_SOCKET ??
  join(
    homedir(),
    "Library/Application Support/Local/run/CSuFeBXEl/mysql/mysqld.sock"
  );

const DEFAULT_AFFILIATE = 126;
const DEFAULT_EMAIL = "andreadrew@yahoo.com";
const DEFAULT_PRODUCT = 25;

function parseArg(name: string): string | null {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const { isProductionStore } = await import("../lib/env-guard");
  const { getSettings } = await import("../lib/settings");

  const settings = await getSettings();
  const storeUrl = settings.wcStoreUrl;

  console.log(`store:      ${storeUrl}`);
  console.log(`production: ${isProductionStore(storeUrl)}`);

  if (isProductionStore(storeUrl)) {
    throw new Error(
      "Refusing to create a demo order on production. Point WC_STORE_URL at Local WordPress."
    );
  }

  if (!existsSync(LOCAL_WP_LOAD)) {
    throw new Error(`Local wp-load.php not found at ${LOCAL_WP_LOAD}`);
  }

  if (!existsSync(LOCAL_PHP)) {
    throw new Error(`Local PHP not found at ${LOCAL_PHP}`);
  }

  const affiliateId = parseArg("affiliate") ?? String(DEFAULT_AFFILIATE);
  const email = parseArg("email") ?? DEFAULT_EMAIL;
  const productId = parseArg("product") ?? String(DEFAULT_PRODUCT);

  console.log(`affiliate:  #${affiliateId} (mock Blair)`);
  console.log(`customer:   ${email}`);
  console.log(`product:    #${productId}\n`);

  let stdout: string;
  let stderr: string;

  try {
    stdout = execFileSync(
      LOCAL_PHP,
      [
        "-d",
        "memory_limit=512M",
        "-d",
        `mysqli.default_socket=${LOCAL_MYSQL_SOCKET}`,
        "-d",
        `pdo_mysql.default_socket=${LOCAL_MYSQL_SOCKET}`,
        join(process.cwd(), "scripts/lifetime-demo-order.php"),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TS_WP_LOAD: LOCAL_WP_LOAD,
          LTC_DEMO_AFFILIATE_ID: affiliateId,
          LTC_DEMO_EMAIL: email,
          LTC_DEMO_PRODUCT_ID: productId,
        },
      }
    ).trim();
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    const detail = [execError.stderr, execError.stdout].filter(Boolean).join("\n").trim();
    throw new Error(detail || execError.message || "lifetime demo order failed");
  }

  const out = stdout;

  if (!out) {
    throw new Error("Demo order script returned no commission output.");
  }

  const [orderId, commissionId, type, status, amount, createdForAffiliate, customerId, customerEmail] =
    out.split("\n")[0].split("\t");

  console.log("created");
  console.log(`  order:       #${orderId}`);
  console.log(`  commission:  #${commissionId}`);
  console.log(`  type:        ${type}`);
  console.log(`  status:      ${status}`);
  console.log(`  amount:      $${amount}`);
  console.log(`  affiliate:   #${createdForAffiliate}`);
  console.log(`  customer:    ${customerEmail} (#${customerId})`);
  console.log("\nview as Blair:");
  console.log("  SliceWP:  https://true-sciences-04.local/affiliate-account/");
  console.log(`  WP admin: https://true-sciences-04.local/wp-admin/post.php?post=${orderId}&action=edit`);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
