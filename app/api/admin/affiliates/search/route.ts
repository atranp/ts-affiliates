import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { searchAffiliates } from "@/lib/admin/queries";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockAdminSearchAffiliates } from "@/lib/mock/admin-fixtures";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? "20");

  if (isAdminMockMode()) {
    return jsonCached(mockAdminSearchAffiliates(q, limit));
  }

  try {
    const result = await searchAffiliates(q, limit);
    return jsonCached(result);
  } catch (error) {
    console.error("Affiliate search failed:", error);
    return NextResponse.json(
      { error: "Failed to search affiliates" },
      { status: 500 }
    );
  }
}
