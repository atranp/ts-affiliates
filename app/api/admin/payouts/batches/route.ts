import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { listPayoutHistoryForAffiliate } from "@/lib/payouts/history";
import { listPayoutBatchesForSponsor } from "@/lib/payouts/queries";
import {
  listSlicewpPayouts,
  listSlicewpPayoutsForAffiliate,
} from "@/lib/payouts/slicewp-queries";
import type { PayoutBatchListItem } from "@/lib/payouts/types";
import { prisma } from "@/lib/prisma";
import { listPayoutBatches } from "@/lib/teams/queries";
import { toNumber } from "@/lib/utils";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockAdminPayoutBatches } from "@/lib/mock/admin-fixtures";

const LIMIT = 50;

async function sponsorNameMap(ids: Array<string | null>) {
  const unique = Array.from(
    new Set(ids.filter((id): id is string => !!id))
  );
  if (unique.length === 0) return new Map<string, string>();

  const affiliates = await prisma.affiliate.findMany({
    where: { id: { in: unique } },
    select: { id: true, displayName: true, email: true },
  });

  return new Map(
    affiliates.map((affiliate) => [
      affiliate.id,
      affiliate.displayName ?? affiliate.email,
    ])
  );
}

function byRecordedAt(a: PayoutBatchListItem, b: PayoutBatchListItem) {
  return (
    new Date(b.processedAt ?? b.createdAt).getTime() -
    new Date(a.processedAt ?? a.createdAt).getTime()
  );
}

async function listAllPayouts(): Promise<PayoutBatchListItem[]> {
  const [batches, slicewp] = await Promise.all([
    listPayoutBatches(LIMIT),
    listSlicewpPayouts(LIMIT),
  ]);

  const platform: PayoutBatchListItem[] = batches.map((batch) => ({
    id: batch.id,
    source: "PLATFORM",
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
  }));

  return [...platform, ...slicewp].sort(byRecordedAt).slice(0, LIMIT);
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const sponsorAffiliateId = searchParams.get("sponsorAffiliateId");
  const affiliateId = searchParams.get("affiliateId");

  if (isAdminMockMode()) {
    return NextResponse.json(
      mockAdminPayoutBatches(sponsorAffiliateId ?? affiliateId ?? undefined)
    );
  }

  // Payouts the affiliate was paid in — what they see in their own portal.
  if (affiliateId) {
    const batches = await listPayoutHistoryForAffiliate(affiliateId, LIMIT);
    return NextResponse.json({ batches });
  }

  // Payouts this affiliate was the subject of, including ones they ran for
  // their team.
  if (sponsorAffiliateId) {
    const [sponsored, slicewp] = await Promise.all([
      listPayoutBatchesForSponsor(sponsorAffiliateId, LIMIT),
      listSlicewpPayoutsForAffiliate(sponsorAffiliateId, LIMIT),
    ]);
    return NextResponse.json({
      batches: [...sponsored, ...slicewp].sort(byRecordedAt).slice(0, LIMIT),
    });
  }

  const batches = await listAllPayouts();
  const names = await sponsorNameMap(
    batches.map((batch) => batch.sponsorAffiliateId)
  );

  return NextResponse.json({
    batches: batches.map((batch) => ({
      ...batch,
      sponsorName: batch.sponsorAffiliateId
        ? (names.get(batch.sponsorAffiliateId) ?? null)
        : null,
    })),
  });
}
