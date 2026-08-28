import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { prisma } from "@/lib/prisma";
import { encryptOptional } from "@/lib/encryption";
import {
  getCredentialSource,
  getSettings,
  hasResolvedSliceWP,
  hasResolvedWooCommerce,
  isEnvCredentialsOverride,
} from "@/lib/settings";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });
  const resolved = await getSettings();

  return jsonCached({
    wcStoreUrl: resolved.wcStoreUrl || null,
    hasWooCommerce: hasResolvedWooCommerce(resolved),
    hasSliceWP: hasResolvedSliceWP(resolved),
    credentialSource: getCredentialSource(),
    envCredentialsActive: isEnvCredentialsOverride(),
    lastAffiliateSyncAt: settings?.lastAffiliateSyncAt,
    lastCommissionSyncAt: settings?.lastCommissionSyncAt,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (isEnvCredentialsOverride()) {
    return NextResponse.json(
      {
        error:
          "USE_ENV_CREDENTIALS=true — credentials are read from .env.local on this dev server. Edit .env.local instead. Saving here would overwrite production config in Supabase without changing what this server uses.",
      },
      { status: 409 }
    );
  }

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
