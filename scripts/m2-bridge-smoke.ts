import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/** Reads every bridge endpoint against the configured store. Read-only. */
async function main() {
  const bridge = await import("../lib/slicewp-bridge");
  const slicewpId = Number(process.argv[2] ?? 17);

  console.log("bridge available:", await bridge.isBridgeAvailable());
  console.log("creatives:", (await bridge.fetchCreatives()).length);
  console.log("affiliate fields:", (await bridge.fetchAffiliateFields()).length);
  console.log(
    `coupons (${slicewpId}):`,
    (await bridge.fetchAffiliateCoupons(slicewpId)).length
  );
  console.log(
    `store credit (${slicewpId}):`,
    JSON.stringify(await bridge.fetchAffiliateStoreCredit(slicewpId))
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
