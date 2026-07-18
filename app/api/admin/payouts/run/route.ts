import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import { startOfDay } from "date-fns";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const payoutWeek = body.payoutWeek
    ? startOfDay(new Date(body.payoutWeek))
    : startOfDay(new Date());

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      status: "UNPAID",
      payoutWeek: { lte: payoutWeek },
    },
    include: {
      affiliate: {
        select: { id: true, email: true, displayName: true },
      },
    },
  });

  if (entries.length === 0) {
    return NextResponse.json({ error: "No unpaid entries for this payout week" }, { status: 400 });
  }

  const batch = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.payoutBatch.create({
      data: {
        label: `Payout ${payoutWeek.toLocaleDateString("en-US")}`,
        periodStart: payoutWeek,
        periodEnd: payoutWeek,
        status: "COMPLETED",
        processedAt: new Date(),
      },
    });

    const totals = new Map<string, { total: number; count: number }>();
    for (const entry of entries) {
      const current = totals.get(entry.affiliateId) ?? { total: 0, count: 0 };
      current.total += toNumber(entry.amount);
      current.count += 1;
      totals.set(entry.affiliateId, current);
    }

    for (const [affiliateId, summary] of Array.from(totals.entries())) {
      await tx.payoutBatchItem.create({
        data: {
          batchId: createdBatch.id,
          affiliateId,
          totalAmount: summary.total,
          entryCount: summary.count,
        },
      });
    }

    await tx.ledgerEntry.updateMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
      data: {
        status: "PAID",
        paidAt: new Date(),
        payoutBatchId: createdBatch.id,
      },
    });

    return createdBatch;
  });

  return NextResponse.json({
    batchId: batch.id,
    entriesPaid: entries.length,
  });
}
