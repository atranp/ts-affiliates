import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { formatPeriodLabel } from "@/lib/payouts/dates";
import { resolvePayoutPeriodFromRequest } from "@/lib/payouts/parse-period";
import { prisma } from "@/lib/prisma";
import { buildPayoutEntryWhere } from "@/lib/payouts/scope";
import type { PayoutScope } from "@/lib/payouts/types";
import { toNumber } from "@/lib/utils";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const teamId: string | undefined = body.teamId;
  const sponsorAffiliateId: string | undefined = body.sponsorAffiliateId;
  const scope: PayoutScope = body.scope ?? (teamId ? "team" : "all");

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

  const where = buildPayoutEntryWhere({
    periodStart,
    periodEnd,
    teamId,
    sponsorAffiliateId: resolvedSponsorId,
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
  const label = team
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
        status: "COMPLETED",
        processedAt: new Date(),
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
    label: batch.label,
    entriesPaid: entries.length,
    teamId: batch.teamId,
    sponsorAffiliateId: batch.sponsorAffiliateId,
  });
}
