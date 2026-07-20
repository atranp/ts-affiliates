import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { prisma } from "@/lib/prisma";
import { encryptOptional } from "@/lib/encryption";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  return jsonCached({
    hasWooCommerce:
      !!settings?.wcStoreUrlEncrypted && !!settings?.wcConsumerKeyEncrypted,
    hasSliceWP:
      !!settings?.slicewpConsumerKeyEncrypted &&
      !!settings?.slicewpConsumerSecretEncrypted,
    lastAffiliateSyncAt: settings?.lastAffiliateSyncAt,
    lastCommissionSyncAt: settings?.lastCommissionSyncAt,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const {
    wcStoreUrl,
    wcConsumerKey,
    wcConsumerSecret,
    slicewpConsumerKey,
    slicewpConsumerSecret,
  } = body as Record<string, string | undefined>;

  const existing = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      wcStoreUrlEncrypted: wcStoreUrl
        ? encryptOptional(wcStoreUrl)
        : existing?.wcStoreUrlEncrypted,
      wcConsumerKeyEncrypted: wcConsumerKey
        ? encryptOptional(wcConsumerKey)
        : existing?.wcConsumerKeyEncrypted,
      wcConsumerSecretEncrypted: wcConsumerSecret
        ? encryptOptional(wcConsumerSecret)
        : existing?.wcConsumerSecretEncrypted,
      slicewpConsumerKeyEncrypted: slicewpConsumerKey
        ? encryptOptional(slicewpConsumerKey)
        : existing?.slicewpConsumerKeyEncrypted,
      slicewpConsumerSecretEncrypted: slicewpConsumerSecret
        ? encryptOptional(slicewpConsumerSecret)
        : existing?.slicewpConsumerSecretEncrypted,
    },
    create: {
      id: "default",
      wcStoreUrlEncrypted: encryptOptional(wcStoreUrl),
      wcConsumerKeyEncrypted: encryptOptional(wcConsumerKey),
      wcConsumerSecretEncrypted: encryptOptional(wcConsumerSecret),
      slicewpConsumerKeyEncrypted: encryptOptional(slicewpConsumerKey),
      slicewpConsumerSecretEncrypted: encryptOptional(slicewpConsumerSecret),
    },
  });

  return NextResponse.json({
    ok: true,
    lastAffiliateSyncAt: settings.lastAffiliateSyncAt,
    lastCommissionSyncAt: settings.lastCommissionSyncAt,
  });
}
