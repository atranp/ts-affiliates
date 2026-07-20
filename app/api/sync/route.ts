import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { prisma } from "@/lib/prisma";
import { runFullSync } from "@/lib/sync";

function authorizeCron(request: Request): boolean {
  const secret = process.env.SYNC_CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || auth === secret;
}

async function runSyncHandler() {
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

export async function GET(request: Request) {
  if (authorizeCron(request)) {
    return runSyncHandler();
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });

  return jsonCached({
    lastAffiliateSyncAt: settings?.lastAffiliateSyncAt?.toISOString() ?? null,
    lastCommissionSyncAt: settings?.lastCommissionSyncAt?.toISOString() ?? null,
    hasWooCommerce:
      !!settings?.wcStoreUrlEncrypted && !!settings?.wcConsumerKeyEncrypted,
    hasSliceWP:
      !!settings?.slicewpConsumerKeyEncrypted &&
      !!settings?.slicewpConsumerSecretEncrypted,
  });
}

export async function POST(request: Request) {
  const cronAuthorized = authorizeCron(request);
  if (!cronAuthorized) {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
  }

  return runSyncHandler();
}
