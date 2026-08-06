import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { formatPeriodLabel } from "@/lib/payouts/dates";
import { resolvePayoutPeriodFromRequest } from "@/lib/payouts/parse-period";
import { prisma } from "@/lib/prisma";
import { buildPayoutEntryWhere } from "@/lib/payouts/scope";
import { AWAITING_PAYMENT_STATUS } from "@/lib/payouts/status";
import type { PayoutScope } from "@/lib/payouts/types";
import { toNumber } from "@/lib/utils";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const teamId: string | undefined = body.teamId;
  const sponsorAffiliateId: string | undefined = body.sponsorAffiliateId;
  const sourceAffiliateId: string | undefined = body.sourceAffiliateId;
  const scope: PayoutScope =
    body.scope ?? (sourceAffiliateId ? "recruit" : teamId ? "team" : "all");

  let periodStart: Date;
  let periodEnd: Date;
  try {
    ({ periodStart, periodEnd } = resolvePayoutPeriodFromRequest({
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      payoutWeek: body.payoutWeek,
    }));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid date range" },
      { status: 400 }
    );
  }

  let team: { id: string; name: string; sponsorAffiliateId: string } | null =
    null;

  if (teamId) {
    team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, sponsorAffiliateId: true },
    });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
  }

  const resolvedSponsorId = team?.sponsorAffiliateId ?? sponsorAffiliateId;

  const sourceAffiliate = sourceAffiliateId
    ? await prisma.affiliate.findUnique({
        where: { id: sourceAffiliateId },
        select: { id: true, displayName: true, email: true },
      })
    : null;

  if (sourceAffiliateId && !sourceAffiliate) {
    return NextResponse.json({ error: "Recruit not found" }, { status: 404 });
  }

  const where = buildPayoutEntryWhere({
    periodStart,
    periodEnd,
    teamId,
    sponsorAffiliateId: resolvedSponsorId,
    sourceAffiliateId,
    scope,
  });

  const entries = await prisma.ledgerEntry.findMany({
    where,
    include: {
      affiliate: {
        select: { id: true, email: true, displayName: true },
      },
    },
  });

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No unpaid entries match this payout scope" },
      { status: 400 }
    );
  }

  const dateLabel = formatPeriodLabel(periodStart, periodEnd);
  const recruitName = sourceAffiliate
    ? (sourceAffiliate.displayName ?? sourceAffiliate.email)
    : null;
  const label = recruitName
    ? `${recruitName}'s sales · ${dateLabel}`
    : team
      ? `${team.name} · ${dateLabel}`
      : scope === "direct"
        ? `Direct payout · ${dateLabel}`
        : resolvedSponsorId
          ? `Payout · ${dateLabel}`
          : `Platform payout · ${dateLabel}`;

  const batch = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.payoutBatch.create({
      data: {
        label,
        periodStart,
        periodEnd,
        status: AWAITING_PAYMENT_STATUS,
        processedAt: null,
        teamId: team?.id ?? null,
        sponsorAffiliateId: resolvedSponsorId ?? null,
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

    // Entries are claimed by the batch immediately so a later run cannot pull
    // them into a second payout. `paidAt` stays null until the money is
    // actually sent, which is what marks the batch COMPLETED.
    await tx.ledgerEntry.updateMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
      data: {
        status: "PAID",
        paidAt: null,
        payoutBatchId: createdBatch.id,
      },
    });

    return createdBatch;
  });

  return NextResponse.json({
    batchId: batch.id,
    label: batch.label,
    entryCount: entries.length,
    teamId: batch.teamId,
    sponsorAffiliateId: batch.sponsorAffiliateId,
  });
}
