import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAdmin } from "@/lib/api-auth";
import { runFullSyncJob } from "@/lib/sync";
import {
  clearStaleSyncLock,
  failSync,
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

  if (!getCronSecret()) {
    console.warn(
      "CRON_SECRET is not set — Vercel cron requests to /api/sync will not authenticate."
    );
  }

  const runJob = () =>
    runFullSyncJob().catch(async (error) => {
      console.error("Background sync failed:", error);
      try {
        await failSync(error);
      } catch (failError) {
        console.error("Could not persist sync failure:", failError);
      }
    });

  // waitUntil is unreliable in local dev — fire-and-forget in-process instead.
  if (process.env.NODE_ENV === "development") {
    void runJob();
    return NextResponse.json({ status: "started" });
  }

  waitUntil(runJob());

  return NextResponse.json({ status: "started" });
}

export async function GET(request: Request) {
  const status = await getSyncStatus();

  if (status.running) {
    await clearStaleSyncLock();
  }

  const current = status.running ? await getSyncStatus() : status;

  if (authorizeCron(request)) {
    if (current.running) {
      return NextResponse.json({ status: "already_running" });
    }
    return startBackgroundSync();
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  return NextResponse.json(current);
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
