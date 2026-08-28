import { normalizeStoreUrl } from "./wordpress-auth";

/**
 * Guards against the two ways a misconfigured `.env.local` can reach past the
 * developer's machine: writing to the live store, and syncing a local store
 * into the live database.
 *
 * Both checks read the connection values themselves rather than an `APP_ENV`
 * flag, because the failure mode being prevented *is* wrong configuration.
 */

const PRODUCTION_STORE_HOSTS = new Set([
  "true-sciences.com",
  "www.true-sciences.com",
]);

/** Supabase project ref backing the deployed app. Public — it ships in NEXT_PUBLIC_SUPABASE_URL. */
const PRODUCTION_SUPABASE_REF =
  process.env.PRODUCTION_SUPABASE_REF ?? "oeeitumsfwcdmzborssc";

const OVERRIDE_HINT =
  "Set ALLOW_PRODUCTION_WRITES=true if this is genuinely intended.";

function storeHost(storeUrl: string): string | null {
  try {
    return new URL(normalizeStoreUrl(storeUrl)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isProductionStore(storeUrl: string): boolean {
  const host = storeHost(storeUrl);
  return host !== null && PRODUCTION_STORE_HOSTS.has(host);
}

/**
 * Both Supabase connection strings embed the project ref, so either one
 * identifies the database without needing a separate marker.
 */
export function isProductionDatabase(): boolean {
  const connection = `${process.env.DATABASE_URL ?? ""} ${
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  }`;
  return connection.includes(PRODUCTION_SUPABASE_REF);
}

function overrideAllowed(): boolean {
  return process.env.ALLOW_PRODUCTION_WRITES === "true";
}

/**
 * Vercel sets this in every deployment, so its absence means the code is
 * running somewhere that is not the deployed app.
 *
 * Preferred over `NODE_ENV`, which `next build && next start` sets to
 * "production" on a developer's own machine.
 */
function runningOnVercel(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * Call before any Supabase Auth mutation that targets a real affiliate:
 * creating a login, resetting a password, disabling access, or revoking
 * sessions.
 *
 * Unlike the store guards, this one keys on *where the code is running* rather
 * than which store is configured. Auth lives in the same Supabase project as
 * the mirror, so a developer pointed at Local WordPress is still one click away
 * from resetting a real affiliate's password or signing them out — and no store
 * setting would reveal that.
 */
export function assertWritableAuth(): void {
  if (runningOnVercel() || !isProductionDatabase() || overrideAllowed()) {
    return;
  }

  throw new Error(
    [
      "Refusing to modify a production affiliate login from a local machine.",
      "This would create, lock out, or sign out a real affiliate.",
      `Use the deployed app, or point Supabase at a scratch project. ${OVERRIDE_HINT}`,
    ].join(" ")
  );
}

/**
 * Call before any request that mutates WordPress. Reads are unrestricted —
 * pulling live data into a scratch database costs nothing but API load.
 */
export function assertWritableStore(storeUrl: string): void {
  if (!isProductionStore(storeUrl) || overrideAllowed()) return;

  throw new Error(
    `Refusing to write to the live store at ${storeHost(storeUrl)}. ${OVERRIDE_HINT}`
  );
}

/**
 * Whether a write applied to `storeUrl` should also be mirrored into the local
 * database.
 *
 * False when the database describes a different store than the one just
 * written to — Mode B, where `.env.local` points at Local WordPress while
 * `DATABASE_URL` still points at production Supabase. Mirroring there would
 * stamp a local edit onto a row that faithfully describes the live store.
 */
export function shouldMirrorWrites(storeUrl: string): boolean {
  return isProductionStore(storeUrl) || !isProductionDatabase();
}

/**
 * Call before any sync run.
 *
 * Reading production into a scratch database is harmless, so this is
 * deliberately one-directional. The reverse is not: a sync pulls whatever the
 * configured store holds and upserts it over the existing rows, and the
 * payment mirror deletes local receipts that the store did not return. Pointed
 * at a stale local WordPress while connected to the live database, that
 * rewrites real commissions and drops real payout receipts.
 */
export function assertSyncTargetsAgree(storeUrl: string): void {
  if (isProductionStore(storeUrl) || !isProductionDatabase() || overrideAllowed()) {
    return;
  }

  throw new Error(
    [
      `Refusing to sync ${storeHost(storeUrl) ?? "an unparseable store URL"}`,
      "into the production database.",
      "This would overwrite live commissions with local data and delete payout",
      `receipts that only exist upstream. Point DATABASE_URL at a scratch project. ${OVERRIDE_HINT}`,
    ].join(" ")
  );
}
