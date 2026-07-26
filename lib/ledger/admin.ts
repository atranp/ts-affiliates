import {
  CommissionStatus,
  LedgerEntryType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ledgerInclude = {
  sourceAffiliate: {
    select: { id: true, email: true, displayName: true },
  },
  dealRule: {
    select: { id: true, name: true },
  },
  payoutBatch: {
    select: { id: true, label: true },
  },
} as const;

export type UpdateLedgerEntryInput = {
  status?: CommissionStatus;
  amount?: number;
  description?: string | null;
};

export type CreateAdjustmentInput = {
  affiliateId: string;
  amount: number;
  description: string;
  status?: CommissionStatus;
};

function parseAmount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return num;
}

function parseStatus(value: unknown): CommissionStatus {
  if (
    typeof value !== "string" ||
    !Object.values(CommissionStatus).includes(value as CommissionStatus)
  ) {
    throw new Error("Invalid status");
  }
  return value as CommissionStatus;
}

export function buildLedgerUpdateData(
  existing: {
    paidAt: Date | null;
    payoutBatchId: string | null;
  },
  input: UpdateLedgerEntryInput
): Prisma.LedgerEntryUpdateInput {
  const data: Prisma.LedgerEntryUpdateInput = {};

  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === CommissionStatus.PAID) {
      data.paidAt = existing.paidAt ?? new Date();
    } else {
      data.paidAt = null;
      data.payoutBatch = { disconnect: true };
      data.payoutWeek = null;
    }
  }

  if (input.amount !== undefined) {
    data.amount = parseAmount(input.amount);
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  return data;
}

export async function updateLedgerEntry(
  id: string,
  input: UpdateLedgerEntryInput
) {
  const existing = await prisma.ledgerEntry.findUnique({ where: { id } });
  if (!existing) return null;

  const data = buildLedgerUpdateData(existing, input);
  if (Object.keys(data).length === 0) {
    return prisma.ledgerEntry.findUnique({
      where: { id },
      include: ledgerInclude,
    });
  }

  return prisma.ledgerEntry.update({
    where: { id },
    data,
    include: ledgerInclude,
  });
}

export async function bulkUpdateLedgerStatus(
  ids: string[],
  status: CommissionStatus
) {
  if (ids.length === 0) return { count: 0 };

  const entries = await prisma.ledgerEntry.findMany({
    where: { id: { in: ids } },
    select: { id: true, paidAt: true, payoutBatchId: true },
  });

  if (entries.length === 0) return { count: 0 };

  const paidAt = status === CommissionStatus.PAID ? new Date() : null;
  const clearPayout = status !== CommissionStatus.PAID;

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.ledgerEntry.update({
        where: { id: entry.id },
        data: {
          status,
          paidAt: status === CommissionStatus.PAID ? entry.paidAt ?? paidAt : null,
          ...(clearPayout
            ? { payoutBatch: { disconnect: true }, payoutWeek: null }
            : {}),
        },
      })
    )
  );

  return { count: entries.length };
}

export async function createAdjustmentEntry(input: CreateAdjustmentInput) {
  const amount = parseAmount(input.amount);
  const description = input.description?.trim();
  if (!description) {
    throw new Error("Description is required");
  }

  const status = input.status
    ? parseStatus(input.status)
    : CommissionStatus.UNPAID;

  return prisma.ledgerEntry.create({
    data: {
      affiliateId: input.affiliateId,
      type: LedgerEntryType.ADJUSTMENT,
      amount,
      status,
      description,
    },
    include: ledgerInclude,
  });
}

export { parseAmount, parseStatus, ledgerInclude };
