import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isAdminMockMode } from "@/lib/mock/config";

const DEFAULT_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (isAdminMockMode()) {
    return NextResponse.json({ entries: [], total: 0, page: 1, pageSize: 0 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
  );
  const action = url.searchParams.get("action");
  const affiliateId = url.searchParams.get("affiliateId");

  const where: Prisma.AdminAuditLogWhereInput = {};
  if (action && action !== "all") where.action = action;
  if (affiliateId) where.affiliateId = affiliateId;

  try {
    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    // AdminAuditLog has no relations, so the admin and affiliate names are
    // resolved in a second pass rather than through a join.
    const adminIds = Array.from(new Set(logs.map((log) => log.adminId)));
    const affiliateIds = Array.from(
      new Set(logs.map((log) => log.affiliateId).filter((v): v is string => !!v))
    );

    const [admins, affiliates] = await Promise.all([
      prisma.profile.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, email: true, name: true },
      }),
      prisma.affiliate.findMany({
        where: { id: { in: affiliateIds } },
        select: { id: true, email: true, displayName: true, slicewpId: true },
      }),
    ]);

    const adminById = new Map(admins.map((a) => [a.id, a]));
    const affiliateById = new Map(affiliates.map((a) => [a.id, a]));

    return NextResponse.json({
      entries: logs.map((log) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt.toISOString(),
        metadata: log.metadata,
        admin: adminById.get(log.adminId)
          ? {
              id: log.adminId,
              email: adminById.get(log.adminId)!.email,
              name: adminById.get(log.adminId)!.name,
            }
          : { id: log.adminId, email: null, name: null },
        affiliate: log.affiliateId
          ? affiliateById.get(log.affiliateId) ?? {
              id: log.affiliateId,
              email: null,
              displayName: null,
              slicewpId: null,
            }
          : null,
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Audit log query failed:", error);
    return NextResponse.json(
      { error: "Failed to load audit log" },
      { status: 500 }
    );
  }
}
