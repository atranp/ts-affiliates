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

export async function getSettings(): Promise<AppSettings> {
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  return {
    wcStoreUrl: (
      decryptOptional(settings?.wcStoreUrlEncrypted) ??
      process.env.WC_STORE_URL ??
      ""
    ).trim(),
    wcConsumerKey: (
      decryptOptional(settings?.wcConsumerKeyEncrypted) ??
      process.env.WC_CONSUMER_KEY ??
      ""
    ).trim(),
    wcConsumerSecret: (
      decryptOptional(settings?.wcConsumerSecretEncrypted) ??
      process.env.WC_CONSUMER_SECRET ??
      ""
    ).trim(),
    slicewpConsumerKey: (
      decryptOptional(settings?.slicewpConsumerKeyEncrypted) ??
      process.env.SLICEWP_CONSUMER_KEY ??
      ""
    ).trim(),
    slicewpConsumerSecret: (
      decryptOptional(settings?.slicewpConsumerSecretEncrypted) ??
      process.env.SLICEWP_CONSUMER_SECRET ??
      ""
    ).trim(),
    lastAffiliateSyncAt: settings?.lastAffiliateSyncAt ?? null,
    lastCommissionSyncAt: settings?.lastCommissionSyncAt ?? null,
  };
}
