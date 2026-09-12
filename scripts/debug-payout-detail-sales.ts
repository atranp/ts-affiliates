import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/** Read-only: why does SliceWP payout detail sale column not match commission sums? */

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getSlicewpPayoutDetail } = await import("../lib/payouts/slicewp-queries");

  const blair = await prisma.affiliate.findFirst({
    where: { slicewpId: 81 },
    select: { id: true },
  });
  if (!blair) return;

  const payment = await prisma.slicewpPayment.findFirst({
    where: { affiliateId: blair.id, slicewpPaymentId: 192 },
    select: { id: true, commissionIds: true },
  });
  if (!payment) return;

  const detail = await getSlicewpPayoutDetail(payment.id);
  if (!detail) return;

  let inheritExtra = 0;
  let directGross = 0;
  let directNet = 0;

  for (const entry of detail.entries) {
    const rev = entry.orderRevenue ?? 0;
    if (entry.type === "OVERRIDE") {
      inheritExtra += rev;
    } else {
      directGross += rev;
    }
  }

  const commissions = await prisma.commission.findMany({
    where: { affiliateId: blair.id, slicewpId: { in: payment.commissionIds } },
    select: { type: true, amount: true, orderRevenue: true, commissionBase: true },
  });

  for (const c of commissions) {
    directNet += toNumber(c.commissionBase ?? c.orderRevenue);
    if ((c.type ?? "").toLowerCase() !== "inherit") {
      directGross += toNumber(c.orderRevenue);
    }
  }

  console.log("Blair payment #192 entries:", detail.entries.length);
  console.log("  detail sale sum:", detail.entries.reduce((s, e) => s + (e.orderRevenue ?? 0), 0).toFixed(2));
  console.log("  OVERRIDE (inherit) sale column:", inheritExtra.toFixed(2));
  console.log("  DIRECT sale column:", (detail.entries.reduce((s, e) => s + (e.orderRevenue ?? 0), 0) - inheritExtra).toFixed(2));
  console.log("  commission gross (non-inherit):", directGross.toFixed(2));
  console.log("  commission net:", directNet.toFixed(2));
}

main()
  .catch(console.error)
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
