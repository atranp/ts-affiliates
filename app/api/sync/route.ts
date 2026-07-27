import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAdmin } from "@/lib/api-auth";
import { runFullSyncJob } from "@/lib/sync";
import {
  clearStaleSyncLock,
  getSyncStatus,
  isSyncStale,
  tryBeginSync,
} from "@/lib/sync-state";

export const maxDuration = 300;

function getCronSecret() {
  return process.env.CRON_SECRET ?? process.env.SYNC_CRON_SECRET;
}

function authorizeCron(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || auth === secret;
}

async function startBackgroundSync() {
  await clearStaleSyncLock();

  const started = await tryBeginSync();
  if (!started) {
    return NextResponse.json({ status: "already_running" });
  }

  waitUntil(
    runFullSyncJob().catch((error) => {
      console.error("Background sync failed:", error);
    })
  );

  return NextResponse.json({ status: "started" });
}

export async function GET(request: Request) {
  await clearStaleSyncLock();
  const status = await getSyncStatus();

  if (authorizeCron(request)) {
    if (status.running) {
      return NextResponse.json({ status: "already_running" });
    }
    return startBackgroundSync();
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const cronAuthorized = authorizeCron(request);

  if (!cronAuthorized) {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
  }

  let auto = false;
  try {
    const body = await request.json();
    auto = body?.auto === true;
  } catch {
    // manual sync — no body
  }

  if (auto && !cronAuthorized) {
    const status = await getSyncStatus();
    if (status.running) {
      return NextResponse.json({ status: "already_running" });
    }
    if (
      !isSyncStale(
        status.lastCommissionSyncAt
          ? new Date(status.lastCommissionSyncAt)
          : null
      )
    ) {
      return NextResponse.json({ status: "fresh" });
    }
    if (!status.hasSliceWP) {
      return NextResponse.json({ status: "not_configured" });
    }
  }

  return startBackgroundSync();
}
