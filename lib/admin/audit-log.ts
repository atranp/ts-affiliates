import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logAdminAction(input: {
  adminId: string;
  action: string;
  affiliateId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      affiliateId: input.affiliateId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
