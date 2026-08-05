import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { syncAffiliate } from "@/lib/sync";
import { formatSyncError } from "@/lib/sync-state";

// Scoped to one affiliate and their recruits, so this runs inline rather than
// as a background job — the caller gets the result directly.
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  try {
    const result = await syncAffiliate(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = formatSyncError(error);
    console.error(`Affiliate sync failed for ${id}:`, error);

    if (message === "Affiliate not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    await prismaSafeLog(id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function prismaSafeLog(affiliateId: string, message: string) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.syncLog.create({
      data: {
        type: "affiliate",
        status: "error",
        message,
        metadata: { affiliateId },
      },
    });
  } catch (logError) {
    console.error("Could not persist affiliate sync failure:", logError);
  }
}
