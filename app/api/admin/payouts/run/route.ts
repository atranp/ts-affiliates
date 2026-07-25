import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { NextResponse } from "next/server";
import { startOfDay } from "date-fns";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";

function buildEntryWhere(options: {
  payoutWeek: Date;
  teamId?: string;
  sponsorAffiliateId?: string;
}) {
  const { payoutWeek, teamId, sponsorAffiliateId } = options;

  return {
    status: CommissionStatus.UNPAID,
    payoutWeek: { lte: payoutWeek },
    ...(teamId
      ? {
          OR: [
            {
              type: LedgerEntryType.OVERRIDE,
              dealRule: { teamId },
            },
            ...(sponsorAffiliateId
              ? [
                  {
                    type: LedgerEntryType.DIRECT,
                    affiliateId: sponsorAffiliateId,
                  },
                ]
              : []),
          ],
        }
      : sponsorAffiliateId
        ? { affiliateId: sponsorAffiliateId }
        : {}),
  } as const;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const payoutWeek = body.payoutWeek
    ? startOfDay(new Date(body.payoutWeek))
    : startOfDay(new Date());
  const teamId: string | undefined = body.teamId;
  const sponsorAffiliateId: string | undefined = body.sponsorAffiliateId;

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

  const where = buildEntryWhere({
    payoutWeek,
    teamId,
    sponsorAffiliateId: resolvedSponsorId,
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

  const label = team
    ? `${team.name} payout · ${payoutWeek.toLocaleDateString("en-US")}`
    : resolvedSponsorId
      ? `Affiliate payout · ${payoutWeek.toLocaleDateString("en-US")}`
      : `Platform payout · ${payoutWeek.toLocaleDateString("en-US")}`;

  const batch = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.payoutBatch.create({
      data: {
        label,
        periodStart: payoutWeek,
        periodEnd: payoutWeek,
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
