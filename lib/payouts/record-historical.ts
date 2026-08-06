import {
  CommissionStatus,
  LedgerEntryType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfStoreDay } from "@/lib/payouts/store-dates";
import { formatAppDate } from "@/lib/timezone";
import { toNumber } from "@/lib/utils";

export type RecordHistoricalPayoutInput = {
  affiliateId: string;
  paidAt: Date;
  label?: string;
  teamId?: string | null;
  mode: "entries" | "lump_sum";
  entryIds?: string[];
  amount?: number;
  description?: string;
};

export type RecordHistoricalPayoutResult = {
  batchId: string;
  label: string;
  entriesPaid: number;
  totalAmount: number;
  processedAt: string;
};

function buildUnpaidEntryWhere(
  affiliateId: string,
  teamId?: string | null
): Prisma.LedgerEntryWhereInput {
  const base: Prisma.LedgerEntryWhereInput = {
    affiliateId,
    status: CommissionStatus.UNPAID,
  };

  if (!teamId) return base;

  return {
    ...base,
    OR: [
      {
        type: LedgerEntryType.OVERRIDE,
        dealRule: { teamId },
      },
      { type: LedgerEntryType.DIRECT },
    ],
  };
}

function defaultLabel(paidAt: Date, teamName?: string | null) {
  const dateLabel = formatAppDate(paidAt);
  return teamName
    ? `${teamName} · Historical · ${dateLabel}`
    : `Historical payout · ${dateLabel}`;
}

export async function recordHistoricalPayout(
  input: RecordHistoricalPayoutInput
): Promise<RecordHistoricalPayoutResult> {
  const paidAt = startOfStoreDay(input.paidAt);
  if (Number.isNaN(paidAt.getTime())) {
    throw new Error("Invalid paid date");
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: input.affiliateId },
    select: { id: true },
  });
  if (!affiliate) {
    throw new Error("Affiliate not found");
  }

  let team: { id: string; name: string } | null = null;
  if (input.teamId) {
    team = await prisma.team.findFirst({
      where: {
        id: input.teamId,
        sponsorAffiliateId: input.affiliateId,
      },
      select: { id: true, name: true },
    });
    if (!team) {
      throw new Error("Team not found for this sponsor");
    }
  }

  if (input.mode === "lump_sum") {
    return recordLumpSumPayout(input, paidAt, team?.name ?? null);
  }

  return recordEntriesPayout(input, paidAt, team);
}

async function recordEntriesPayout(
  input: RecordHistoricalPayoutInput,
  paidAt: Date,
  team: { id: string; name: string } | null
): Promise<RecordHistoricalPayoutResult> {
  const where: Prisma.LedgerEntryWhereInput = input.entryIds?.length
    ? {
        id: { in: input.entryIds },
        affiliateId: input.affiliateId,
        status: CommissionStatus.UNPAID,
      }
    : buildUnpaidEntryWhere(input.affiliateId, team?.id ?? input.teamId);

  const entries = await prisma.ledgerEntry.findMany({
    where,
    select: { id: true, affiliateId: true, amount: true },
  });

  if (entries.length === 0) {
    throw new Error("No unpaid entries match this payout");
  }

  const label =
    input.label?.trim() ||
    defaultLabel(paidAt, team?.name ?? null);

  const batch = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.payoutBatch.create({
      data: {
        label,
        periodStart: paidAt,
        periodEnd: paidAt,
        status: "COMPLETED",
        processedAt: paidAt,
        teamId: team?.id ?? input.teamId ?? null,
        sponsorAffiliateId: input.affiliateId,
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
        status: CommissionStatus.PAID,
        paidAt,
        payoutBatchId: createdBatch.id,
      },
    });

    return createdBatch;
  });

  const totalAmount = entries.reduce(
    (sum, entry) => sum + toNumber(entry.amount),
    0
  );

  return {
    batchId: batch.id,
    label: batch.label,
    entriesPaid: entries.length,
    totalAmount,
    processedAt: paidAt.toISOString(),
  };
}

async function recordLumpSumPayout(
  input: RecordHistoricalPayoutInput,
  paidAt: Date,
  teamName: string | null
): Promise<RecordHistoricalPayoutResult> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const description = input.description?.trim();
  if (!description) {
    throw new Error("Description is required for lump-sum payouts");
  }

  const label =
    input.label?.trim() ||
    defaultLabel(paidAt, teamName);

  const batch = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.payoutBatch.create({
      data: {
        label,
        periodStart: paidAt,
        periodEnd: paidAt,
        status: "COMPLETED",
        processedAt: paidAt,
        teamId: input.teamId ?? null,
        sponsorAffiliateId: input.affiliateId,
      },
    });

    const entry = await tx.ledgerEntry.create({
      data: {
        affiliateId: input.affiliateId,
        type: LedgerEntryType.ADJUSTMENT,
        amount,
        status: CommissionStatus.PAID,
        description,
        paidAt,
        payoutBatchId: createdBatch.id,
      },
    });

    await tx.payoutBatchItem.create({
      data: {
        batchId: createdBatch.id,
        affiliateId: input.affiliateId,
        totalAmount: amount,
        entryCount: 1,
      },
    });

    return { batch: createdBatch, entry };
  });

  return {
    batchId: batch.batch.id,
    label: batch.batch.label,
    entriesPaid: 1,
    totalAmount: amount,
    processedAt: paidAt.toISOString(),
  };
}

export async function previewHistoricalPayout(options: {
  affiliateId: string;
  teamId?: string | null;
  entryIds?: string[];
}): Promise<{ entryCount: number; totalAmount: number }> {
  const where: Prisma.LedgerEntryWhereInput = options.entryIds?.length
    ? {
        id: { in: options.entryIds },
        affiliateId: options.affiliateId,
        status: CommissionStatus.UNPAID,
      }
    : buildUnpaidEntryWhere(options.affiliateId, options.teamId);

  const result = await prisma.ledgerEntry.aggregate({
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });

  return {
    entryCount: result._count._all,
    totalAmount: toNumber(result._sum.amount),
  };
}
