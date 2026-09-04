import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/** Read-only smoke test for GET /commissions/{id}/journey */
async function main() {
  const commissionId = Number(process.argv[2]);

  if (!Number.isFinite(commissionId) || commissionId <= 0) {
    console.error("Usage: npx tsx scripts/m2-journey-smoke.ts <slicewp_commission_id>");
    process.exit(1);
  }

  const bridge = await import("../lib/slicewp-bridge");

  console.log("bridge available:", await bridge.isBridgeAvailable());

  const journey = await bridge.fetchCommissionJourney(commissionId);

  console.log(JSON.stringify(journey, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
