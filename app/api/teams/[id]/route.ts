import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { getTeamDetail } from "@/lib/teams/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const sponsorFilter =
    auth.user.role === "ADMIN" ? undefined : auth.user.affiliateId ?? undefined;

  if (auth.user.role !== "ADMIN" && !sponsorFilter) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const team = await getTeamDetail(id, sponsorFilter);

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return jsonCached({ team });
}
