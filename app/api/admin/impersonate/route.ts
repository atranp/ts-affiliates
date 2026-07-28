import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  applyImpersonateCookie,
  clearImpersonateCookie,
} from "@/lib/auth-impersonation";
import { logAdminAction } from "@/lib/admin/audit-log";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let affiliateId: string;
  try {
    const body = (await request.json()) as { affiliateId?: string };
    if (!body.affiliateId) {
      return NextResponse.json(
        { error: "affiliateId is required" },
        { status: 400 }
      );
    }
    affiliateId = body.affiliateId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { id: true, displayName: true, email: true },
  });

  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  await logAdminAction({
    adminId: auth.user.id,
    action: "IMPERSONATE_START",
    affiliateId,
    metadata: {
      affiliateEmail: affiliate.email,
      affiliateName: affiliate.displayName,
    },
  });

  const response = NextResponse.json({
    ok: true,
    affiliateId,
    redirectTo: "/dashboard",
  });
  return applyImpersonateCookie(response, affiliateId);
}

export async function DELETE() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  await logAdminAction({
    adminId: auth.user.id,
    action: "IMPERSONATE_STOP",
  });

  const response = NextResponse.json({
    ok: true,
    redirectTo: "/admin",
  });
  return clearImpersonateCookie(response);
}
