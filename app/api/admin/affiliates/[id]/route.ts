import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { getAffiliateDetail } from "@/lib/admin/queries";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockAdminAffiliateDetail } from "@/lib/mock/admin-fixtures";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  if (isAdminMockMode()) {
    const affiliate = mockAdminAffiliateDetail(id);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }
    return jsonCached(affiliate);
  }

  try {
    const affiliate = await getAffiliateDetail(id);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }
    return jsonCached(affiliate);
  } catch (error) {
    console.error("Affiliate detail failed:", error);
    return NextResponse.json(
      { error: "Failed to load affiliate" },
      { status: 500 }
    );
  }
}
