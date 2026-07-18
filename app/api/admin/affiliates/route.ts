import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getPaginatedAffiliates } from "@/lib/admin/queries";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "25");
  const q = searchParams.get("q") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  try {
    const result = await getPaginatedAffiliates({ page, pageSize, q, status });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Affiliates list failed:", error);
    return NextResponse.json(
      { error: "Failed to load affiliates" },
      { status: 500 }
    );
  }
}
