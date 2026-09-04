import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });
if (process.env.BACKFILL_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  process.env.DIRECT_URL =
    process.env.BACKFILL_DIRECT_URL ?? process.env.BACKFILL_DATABASE_URL;
}
async function main() {
  const { prisma } = await import("../lib/prisma");
  const remaining = await prisma.commission.count({
    where: {
      wooOrderId: { not: null },
      origin: "woo",
      customerSlicewpId: null,
      NOT: { type: { equals: "inherit", mode: "insensitive" } },
    },
  });
  const o1573 = await prisma.commission.findFirst({
    where: { wooOrderId: 1573 },
    select: { customerSlicewpId: true, wooOrderId: true },
  });
  console.log("remaining null customerSlicewpId:", remaining);
  console.log("order 1573:", o1573);
  await prisma.$disconnect();
}
main();
