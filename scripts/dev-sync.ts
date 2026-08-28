import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Runs a full sync from the configured store into the configured database.
 *
 * Exists because the sync is otherwise only reachable through an authenticated
 * route or the Vercel cron, neither of which is convenient in Mode C.
 * `runFullSync()` calls `assertSyncTargetsAgree()` itself, so a mismatched
 * store/database pair still fails here.
 *
 * Drives the same lock lifecycle as `app/api/sync/route.ts` rather than calling
 * `runFullSync()` bare. Beyond honouring the concurrency lock and writing a
 * `SyncLog` row, `tryBeginSync()` is what creates the `Settings` singleton — so
 * skipping it makes the very first sync against a fresh database fail inside
 * `setSyncStep()`.
 *
 * Usage: npx tsx scripts/dev-sync.ts
 */

async function main() {
  const { isProductionDatabase, isProductionStore } = await import(
    "../lib/env-guard"
  );
  const { getSettings } = await import("../lib/settings");
  const { runFullSyncJob } = await import("../lib/sync");
  const { clearStaleSyncLock, tryBeginSync } = await import("../lib/sync-state");

  const { wcStoreUrl } = await getSettings();

  console.log(`store:      ${wcStoreUrl} (production: ${isProductionStore(wcStoreUrl)})`);
  console.log(
    `database:   ${process.env.NEXT_PUBLIC_SUPABASE_URL} (production: ${isProductionDatabase()})\n`
  );

  await clearStaleSyncLock();

  if (!(await tryBeginSync())) {
    throw new Error(
      "A sync is already running. Wait for it to finish, or clear the lock in the admin UI."
    );
  }

  const started = Date.now();
  const result = await runFullSyncJob();

  console.log(JSON.stringify(result, null, 2));
  console.log(`\ncompleted in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
