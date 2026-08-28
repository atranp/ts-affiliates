import { NextResponse } from "next/server";
import { PayoutWriteBackStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/admin/audit-log";
import { getWriteBackHealth } from "@/lib/payouts/reconcile";
import { settlePayoutBatch } from "@/lib/payouts/settle";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockWriteBackHealth } from "@/lib/mock/admin-fixtures";

/**
 * Outstanding payout write-backs, and the retry for them.
 *
 * Retry is a plain POST with no confirmation step because it cannot double-pay:
 * the batch id is the settle idempotency key, so a retry either completes a
 * settlement that never landed or replays the one that did.
 */

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (isAdminMockMode()) {
    return NextResponse.json(mockWriteBackHealth());
  }

  return NextResponse.json(await getWriteBackHealth());
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (isAdminMockMode()) {
    return NextResponse.json(
      { error: "Write-back retry is disabled in mock mode." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const batchId =
    body && typeof body === "object"
      ? (body as { batchId?: unknown }).batchId
      : undefined;

  if (typeof batchId !== "string" || !batchId.trim()) {
    return NextResponse.json({ error: "batchId is required" }, { status: 400 });
  }

  try {
    const result = await settlePayoutBatch(batchId);

    await logAdminAction({
      adminId: auth.user.id,
      action: "payout.write_back_retry",
      metadata: {
        batchId,
        status: result.status,
        slicewpPaymentId: result.slicewpPaymentId,
        error: result.error,
      },
    });

    // The settle failing again is a valid outcome to report, not a server
    // error — the caller needs the reason, and the batch is still retryable.
    return NextResponse.json(result, {
      status: result.status === PayoutWriteBackStatus.FAILED ? 409 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Retry failed." },
      { status: 500 }
    );
  }
}
