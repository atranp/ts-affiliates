import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { inviteAffiliateToPortal } from "@/lib/admin/affiliate-portal";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockInviteAffiliate } from "@/lib/mock/admin-fixtures";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  try {
    if (isAdminMockMode()) {
      return NextResponse.json(mockInviteAffiliate(id));
    }

    const result = await inviteAffiliateToPortal(id, auth.user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Affiliate invite failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to set up portal access",
      },
      { status: 400 }
    );
  }
}
