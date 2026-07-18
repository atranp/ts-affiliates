import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { runFullSync } from "@/lib/sync";

function authorizeCron(request: Request): boolean {
  const secret = process.env.SYNC_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  const cronAuthorized = authorizeCron(request);
  if (!cronAuthorized) {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
  }

  try {
    const result = await runFullSync();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Sync failed unexpectedly",
      },
      { status: 502 }
    );
  }
}
