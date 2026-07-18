import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getAdminStats } from "@/lib/admin/queries";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const stats = await getAdminStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Admin stats failed:", error);
    return NextResponse.json(
      { error: "Failed to load admin stats" },
      { status: 500 }
    );
  }
}
