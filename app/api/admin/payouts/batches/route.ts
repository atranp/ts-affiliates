import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { listPayoutBatches } from "@/lib/teams/queries";
import { toNumber } from "@/lib/utils";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const batches = await listPayoutBatches(50);

  return NextResponse.json({
    batches: batches.map((batch) => ({
      id: batch.id,
      label: batch.label,
      status: batch.status,
      periodStart: batch.periodStart.toISOString(),
      periodEnd: batch.periodEnd.toISOString(),
      processedAt: batch.processedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      teamId: batch.teamId,
      teamName: batch.team?.name ?? null,
      sponsorAffiliateId: batch.sponsorAffiliateId,
      entryCount: batch._count.ledgerEntries,
      affiliateCount: batch.items.length,
      totalAmount: batch.items.reduce(
        (sum, item) => sum + toNumber(item.totalAmount),
        0
      ),
      items: batch.items.map((item) => ({
        affiliateId: item.affiliateId,
        displayName: item.affiliate.displayName,
        email: item.affiliate.email,
        totalAmount: item.totalAmount.toString(),
        entryCount: item.entryCount,
      })),
    })),
  });
}
