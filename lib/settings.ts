import { prisma } from "./prisma";
import { decryptOptional } from "./encryption";

export interface AppSettings {
  wcStoreUrl: string;
  wcConsumerKey: string;
  wcConsumerSecret: string;
  slicewpConsumerKey: string;
  slicewpConsumerSecret: string;
  lastAffiliateSyncAt: Date | null;
  lastCommissionSyncAt: Date | null;
}

export type CredentialSource = "database" | "env";

/**
 * When true (dev only), integration credentials come from `.env.local` instead
 * of the encrypted Settings row in Supabase. Keeps local dev from reading prod
 * credentials out of the shared database and lets you point at Local WP without
 * overwriting the row Vercel uses.
 */
export function isEnvCredentialsOverride(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.USE_ENV_CREDENTIALS === "true"
  );
}

function trimEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

function resolveCredential(
  encrypted: string | null | undefined,
  envValue: string | undefined
): string {
  if (isEnvCredentialsOverride()) {
    return trimEnv(envValue);
  }
  return (decryptOptional(encrypted) ?? trimEnv(envValue)).trim();
}

export async function getSettings(): Promise<AppSettings> {
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  return {
    wcStoreUrl: resolveCredential(
      settings?.wcStoreUrlEncrypted,
      process.env.WC_STORE_URL
    ),
    wcConsumerKey: resolveCredential(
      settings?.wcConsumerKeyEncrypted,
      process.env.WC_CONSUMER_KEY
    ),
    wcConsumerSecret: resolveCredential(
      settings?.wcConsumerSecretEncrypted,
      process.env.WC_CONSUMER_SECRET
    ),
    slicewpConsumerKey: resolveCredential(
      settings?.slicewpConsumerKeyEncrypted,
      process.env.SLICEWP_CONSUMER_KEY
    ),
    slicewpConsumerSecret: resolveCredential(
      settings?.slicewpConsumerSecretEncrypted,
      process.env.SLICEWP_CONSUMER_SECRET
    ),
    lastAffiliateSyncAt: settings?.lastAffiliateSyncAt ?? null,
    lastCommissionSyncAt: settings?.lastCommissionSyncAt ?? null,
  };
}

export function getCredentialSource(): CredentialSource {
  return isEnvCredentialsOverride() ? "env" : "database";
}

export function hasResolvedWooCommerce(settings: AppSettings): boolean {
  return !!(
    settings.wcStoreUrl &&
    settings.wcConsumerKey &&
    settings.wcConsumerSecret
  );
}

export function hasResolvedSliceWP(settings: AppSettings): boolean {
  return !!(
    settings.slicewpConsumerKey && settings.slicewpConsumerSecret
  );
}
