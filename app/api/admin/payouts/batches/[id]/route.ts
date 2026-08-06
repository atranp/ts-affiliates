import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPayoutBatchDetail } from "@/lib/payouts/queries";
import { AWAITING_PAYMENT_STATUS, PAID_STATUS } from "@/lib/payouts/status";

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

/** Flips a payout between "awaiting payment" and "paid" once money has moved. */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const paid = body.paid !== false;

  const batch = await prisma.payoutBatch.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!batch) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  const paidAt = paid ? new Date() : null;

  await prisma.$transaction([
    prisma.payoutBatch.update({
      where: { id: params.id },
      data: {
        status: paid ? PAID_STATUS : AWAITING_PAYMENT_STATUS,
        processedAt: paidAt,
      },
    }),
    prisma.ledgerEntry.updateMany({
      where: { payoutBatchId: params.id },
      data: { paidAt },
    }),
  ]);

  return NextResponse.json({ id: params.id, paid });
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
