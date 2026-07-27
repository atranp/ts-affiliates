import { prisma } from "./prisma";
import type { SyncResult } from "./sync";

export type SyncStep = "affiliates" | "profiles" | "commissions";

export type SyncStatus = {
  running: boolean;
  step: SyncStep | null;
  startedAt: string | null;
  lastAffiliateSyncAt: string | null;
  lastCommissionSyncAt: string | null;
  lastSyncError: string | null;
  lastSyncResult: SyncResult | null;
  hasWooCommerce: boolean;
  hasSliceWP: boolean;
};

const STALE_MS = 6 * 60 * 60 * 1000;

export function isSyncStale(lastCommissionSyncAt: Date | null | undefined) {
  if (!lastCommissionSyncAt) return true;
  return Date.now() - lastCommissionSyncAt.getTime() > STALE_MS;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });

  return {
    running: settings?.syncRunning ?? false,
    step: (settings?.syncStep as SyncStep | null) ?? null,
    startedAt: settings?.syncStartedAt?.toISOString() ?? null,
    lastAffiliateSyncAt: settings?.lastAffiliateSyncAt?.toISOString() ?? null,
    lastCommissionSyncAt: settings?.lastCommissionSyncAt?.toISOString() ?? null,
    lastSyncError: settings?.lastSyncError ?? null,
    lastSyncResult: (settings?.lastSyncResult as SyncResult | null) ?? null,
    hasWooCommerce:
      !!settings?.wcStoreUrlEncrypted && !!settings?.wcConsumerKeyEncrypted,
    hasSliceWP:
      !!settings?.slicewpConsumerKeyEncrypted &&
      !!settings?.slicewpConsumerSecretEncrypted,
  };
}

export async function tryBeginSync(): Promise<boolean> {
  const updated = await prisma.settings.updateMany({
    where: { id: "default", syncRunning: false },
    data: {
      syncRunning: true,
      syncStep: "affiliates",
      syncStartedAt: new Date(),
      lastSyncError: null,
    },
  });

  if (updated.count > 0) return true;

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) {
    await prisma.settings.create({
      data: {
        id: "default",
        syncRunning: true,
        syncStep: "affiliates",
        syncStartedAt: new Date(),
      },
    });
    return true;
  }

  return false;
}

export async function setSyncStep(step: SyncStep) {
  await prisma.settings.update({
    where: { id: "default" },
    data: { syncStep: step },
  });
}

export async function completeSync(result: SyncResult) {
  await prisma.settings.update({
    where: { id: "default" },
    data: {
      syncRunning: false,
      syncStep: null,
      syncStartedAt: null,
      lastSyncError: null,
      lastSyncResult: result,
    },
  });

  await prisma.syncLog.create({
    data: {
      type: "full",
      status: "success",
      message: `Synced ${result.affiliatesUpserted} affiliates, ${result.commissionsUpserted} commissions`,
      metadata: result,
    },
  });
}

export async function failSync(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Sync failed unexpectedly";

  await prisma.settings.update({
    where: { id: "default" },
    data: {
      syncRunning: false,
      syncStep: null,
      syncStartedAt: null,
      lastSyncError: message,
    },
  });

  await prisma.syncLog.create({
    data: {
      type: "full",
      status: "error",
      message,
    },
  });
}

/** Reset sync lock if stuck longer than 15 minutes (crashed serverless). */
export async function clearStaleSyncLock() {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.syncRunning || !settings.syncStartedAt) return;

  const ageMs = Date.now() - settings.syncStartedAt.getTime();
  if (ageMs < 15 * 60 * 1000) return;

  await failSync("Sync timed out or was interrupted. Try again.");
}
