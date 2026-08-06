import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AWAITING_PAYMENT_STATUS, PAID_STATUS } from "@/lib/payouts/status";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body: { ids?: unknown } = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No payouts selected" }, { status: 400 });
  }

  const paidAt = new Date();
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      const result = await tx.payoutBatch.updateMany({
        where: { id, status: AWAITING_PAYMENT_STATUS },
        data: {
          status: PAID_STATUS,
          processedAt: paidAt,
        },
      });
      if (result.count === 0) continue;
      updated += 1;
      await tx.ledgerEntry.updateMany({
        where: { payoutBatchId: id },
        data: { paidAt },
      });
    }
  });

  return NextResponse.json({ updated });
}
