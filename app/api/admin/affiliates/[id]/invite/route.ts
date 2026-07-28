import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { inviteAffiliateToPortal } from "@/lib/admin/affiliate-portal";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  try {
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
