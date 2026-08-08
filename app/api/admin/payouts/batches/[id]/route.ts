import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPayoutBatchDetail } from "@/lib/payouts/queries";
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const batch = await getPayoutBatchDetail(params.id);
  if (!batch) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}

/**
 * Removes a payout created in error and returns its entries to the unpaid pool
 * so they can be picked up by a corrected run.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const batch = await prisma.payoutBatch.findUnique({
    where: { id: params.id },
    select: { id: true, label: true },
  });
  if (!batch) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  const released = await prisma.$transaction(async (tx) => {
    const { count } = await tx.ledgerEntry.updateMany({
      where: { payoutBatchId: params.id },
      data: { status: "UNPAID", paidAt: null, payoutBatchId: null },
    });
    await tx.payoutBatchItem.deleteMany({ where: { batchId: params.id } });
    await tx.payoutBatch.delete({ where: { id: params.id } });
    return count;
  });

  return NextResponse.json({ deleted: true, entriesReleased: released });
}
