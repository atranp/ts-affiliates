import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  disableAffiliatePortalAccess,
  enableAffiliatePortalAccess,
  forceAffiliateSignOut,
  resetAffiliatePortalPassword,
} from "@/lib/admin/affiliate-portal";

type RouteContext = { params: Promise<{ id: string }> };

type PortalAction =
  | "reset-password"
  | "disable"
  | "enable"
  | "sign-out";

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  let action: PortalAction;
  try {
    const body = (await request.json()) as { action?: PortalAction };
    action = body.action ?? "reset-password";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
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
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
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
