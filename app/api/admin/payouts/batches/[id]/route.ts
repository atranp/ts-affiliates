import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPayoutDetail } from "@/lib/payouts/history";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockAdminPayoutBatchDetail } from "@/lib/mock/admin-fixtures";
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (isAdminMockMode()) {
    const batch = mockAdminPayoutBatchDetail(params.id);
    if (!batch) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }
    return NextResponse.json(batch);
  }

  const batch = await getPayoutDetail(params.id);
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
    // A SliceWP payout is a mirror of a WordPress record, so deleting our copy
    // would only put it back on the next sync.
    const slicewpPayment = await prisma.slicewpPayment.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (slicewpPayment) {
      return NextResponse.json(
        {
          error:
            "This payout was recorded in SliceWP. Delete it in WordPress and re-sync.",
        },
        { status: 409 }
      );
    }
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
