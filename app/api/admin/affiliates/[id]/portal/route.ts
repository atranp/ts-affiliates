import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  disableAffiliatePortalAccess,
  enableAffiliatePortalAccess,
  forceAffiliateSignOut,
  resetAffiliatePortalPassword,
} from "@/lib/admin/affiliate-portal";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockPortalAction } from "@/lib/mock/admin-fixtures";

type RouteContext = { params: Promise<{ id: string }> };

const PORTAL_ACTIONS = [
  "reset-password",
  "disable",
  "enable",
  "sign-out",
] as const;

type PortalAction = (typeof PORTAL_ACTIONS)[number];

function isPortalAction(value: unknown): value is PortalAction {
  return PORTAL_ACTIONS.includes(value as PortalAction);
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  let action: PortalAction;
  try {
    const body = (await request.json()) as { action?: unknown };
    const requested = body.action ?? "reset-password";
    if (!isPortalAction(requested)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    action = requested;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    if (isAdminMockMode()) {
      return NextResponse.json(mockPortalAction(id, action));
    }

    switch (action) {
      case "reset-password": {
        const result = await resetAffiliatePortalPassword(id, auth.user.id);
        return NextResponse.json(result);
      }
      case "disable": {
        const result = await disableAffiliatePortalAccess(id, auth.user.id);
        return NextResponse.json(result);
      }
      case "enable": {
        const result = await enableAffiliatePortalAccess(id, auth.user.id);
        return NextResponse.json(result);
      }
      case "sign-out": {
        const result = await forceAffiliateSignOut(id, auth.user.id);
        return NextResponse.json(result);
      }
    }
  } catch (error) {
    console.error("Portal action failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Portal action failed",
      },
      { status: 400 }
    );
  }
}
