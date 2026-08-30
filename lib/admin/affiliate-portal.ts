import { randomInt } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertWritableAuth } from "@/lib/env-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkProfileToAffiliateByEmail } from "@/lib/sync";
import {
  buildPortalConfirmUrl,
  buildPortalInviteMessage,
  PORTAL_LINK_TTL_HOURS,
  resolveAppOrigin,
  type PortalLinkKind,
} from "./portal-credentials";
import { logAdminAction } from "./audit-log";

export { buildPortalInviteMessage };

/** Where a redeemed link drops the affiliate, so they pick their own password. */
const SET_PASSWORD_PATH = "/account/change-password";

const PASSWORD_ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Retires whatever password an account currently holds. The value is never
 * returned or shown — that is the point, since it leaves the one-time link as
 * the only way in. Every password the old flow issued reached its owner as
 * plaintext sitting in a mailbox, so re-issuing a link is the right moment to
 * make those dead.
 */
function unknowablePassword(length = 48): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return result;
}

export type InviteAffiliateResult = {
  created: boolean;
  linked: boolean;
  email: string;
  profileId: string;
  inviteLink?: string;
  inviteMessage?: string;
  expiresInHours?: number;
};

export type PortalActionResult = {
  email: string;
  inviteLink?: string;
  inviteMessage?: string;
  expiresInHours?: number;
};

async function getAffiliateWithProfile(affiliateId: string) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: { profile: true },
  });

  if (!affiliate) {
    throw new Error("Affiliate not found");
  }

  return affiliate;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  const normalized = email.toLowerCase();
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(`Failed to look up auth user: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === normalized
    );
    if (match) return match.id;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

async function prepareAuthUser(
  userId: string,
  displayName: string,
  options: { retireExistingPassword?: boolean } = {}
) {
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role: Role.AFFILIATE },
    user_metadata: { name: displayName },
    ban_duration: "none",
    ...(options.retireExistingPassword
      ? { password: unknowablePassword() }
      : {}),
  });

  if (error) {
    throw new Error(`Failed to prepare login: ${error.message}`);
  }
}

/**
 * Returns the token for a single-use link. Sends nothing: `generateLink` exists
 * precisely so the caller can deliver it themselves, unlike `inviteUserByEmail`.
 *
 * `invite` also creates the auth user; `recovery` requires one to exist, which
 * is why the caller picks based on whether the address is already registered.
 */
async function generatePortalLink(
  email: string,
  kind: PortalLinkKind
): Promise<{ tokenHash: string; userId: string | null }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.auth.admin.generateLink({
    type: kind,
    email,
  });

  if (error) {
    throw new Error(`Failed to generate ${kind} link: ${error.message}`);
  }

  const tokenHash = data.properties?.hashed_token;

  if (!tokenHash) {
    throw new Error("Supabase returned no token for the portal link");
  }

  return { tokenHash, userId: data.user?.id ?? null };
}

export async function inviteAffiliateToPortal(
  affiliateId: string,
  adminId?: string,
  requestOrigin?: string
): Promise<InviteAffiliateResult> {
  assertWritableAuth();

  const affiliate = await getAffiliateWithProfile(affiliateId);
  const email = affiliate.email.toLowerCase();
  const displayName =
    affiliate.displayName ?? email.split("@")[0] ?? "Affiliate";

  if (affiliate.profile) {
    return {
      created: false,
      linked: true,
      email: affiliate.profile.email,
      profileId: affiliate.profile.id,
    };
  }

  const existingProfile = await prisma.profile.findUnique({
    where: { email },
  });

  if (existingProfile) {
    if (
      existingProfile.affiliateId &&
      existingProfile.affiliateId !== affiliateId
    ) {
      throw new Error("This email is already linked to another affiliate");
    }

    await prisma.profile.update({
      where: { id: existingProfile.id },
      data: {
        affiliateId,
        portalDisabledAt: null,
      },
    });

    if (adminId) {
      await logAdminAction({
        adminId,
        action: "PORTAL_LINK",
        affiliateId,
        metadata: { profileId: existingProfile.id },
      });
    }

    return {
      created: false,
      linked: true,
      email: existingProfile.email,
      profileId: existingProfile.id,
    };
  }

  const existingAuthId = await findAuthUserIdByEmail(email);
  const kind: PortalLinkKind = existingAuthId ? "recovery" : "invite";

  // `invite` creates the account, so metadata can only be applied afterwards.
  // For an account that already exists the order is reversed: retire the old
  // password first, so the link that gets minted is the only way in.
  let userId = existingAuthId;

  if (existingAuthId) {
    await prepareAuthUser(existingAuthId, displayName, {
      retireExistingPassword: true,
    });
  }

  const { tokenHash, userId: generatedUserId } = await generatePortalLink(
    email,
    kind
  );

  userId = userId ?? generatedUserId;

  if (!userId) {
    throw new Error("Failed to resolve portal user");
  }

  if (!existingAuthId) {
    await prepareAuthUser(userId, displayName);
  }

  await prisma.profile.upsert({
    where: { id: userId },
    update: {
      email,
      name: displayName,
      role: Role.AFFILIATE,
      affiliateId,
      mustChangePassword: true,
      portalDisabledAt: null,
    },
    create: {
      id: userId,
      email,
      name: displayName,
      role: Role.AFFILIATE,
      affiliateId,
      mustChangePassword: true,
    },
  });

  await linkProfileToAffiliateByEmail(userId, email);

  const inviteLink = buildPortalConfirmUrl({
    origin: resolveAppOrigin(requestOrigin),
    tokenHash,
    kind,
    next: SET_PASSWORD_PATH,
  });

  const inviteMessage = buildPortalInviteMessage({
    name: displayName,
    email,
    link: inviteLink,
    kind,
  });

  if (adminId) {
    await logAdminAction({
      adminId,
      action: existingAuthId ? "PORTAL_RESET_PASSWORD" : "PORTAL_CREATE",
      affiliateId,
      metadata: { profileId: userId, linkKind: kind },
    });
  }

  return {
    created: !existingAuthId,
    linked: true,
    email,
    profileId: userId,
    inviteLink,
    inviteMessage,
    expiresInHours: PORTAL_LINK_TTL_HOURS,
  };
}

export async function resetAffiliatePortalPassword(
  affiliateId: string,
  adminId: string,
  requestOrigin?: string
): Promise<PortalActionResult> {
  assertWritableAuth();

  const affiliate = await getAffiliateWithProfile(affiliateId);

  if (!affiliate.profile) {
    throw new Error("Affiliate does not have portal access");
  }

  const displayName =
    affiliate.displayName ?? affiliate.profile.name ?? affiliate.email;

  await prepareAuthUser(affiliate.profile.id, displayName, {
    retireExistingPassword: true,
  });

  const { tokenHash } = await generatePortalLink(
    affiliate.profile.email,
    "recovery"
  );

  await prisma.profile.update({
    where: { id: affiliate.profile.id },
    data: {
      mustChangePassword: true,
      portalDisabledAt: null,
    },
  });

  const inviteLink = buildPortalConfirmUrl({
    origin: resolveAppOrigin(requestOrigin),
    tokenHash,
    kind: "recovery",
    next: SET_PASSWORD_PATH,
  });

  const inviteMessage = buildPortalInviteMessage({
    name: displayName,
    email: affiliate.profile.email,
    link: inviteLink,
    kind: "recovery",
  });

  await logAdminAction({
    adminId,
    action: "PORTAL_RESET_PASSWORD",
    affiliateId,
    metadata: { profileId: affiliate.profile.id, linkKind: "recovery" },
  });

  return {
    email: affiliate.profile.email,
    inviteLink,
    inviteMessage,
    expiresInHours: PORTAL_LINK_TTL_HOURS,
  };
}

export async function disableAffiliatePortalAccess(
  affiliateId: string,
  adminId: string
): Promise<{ email: string }> {
  const affiliate = await getAffiliateWithProfile(affiliateId);

  if (!affiliate.profile) {
    throw new Error("Affiliate does not have portal access");
  }

  assertWritableAuth();

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(
    affiliate.profile.id,
    { ban_duration: "876000h" }
  );

  if (error) {
    throw new Error(`Failed to disable login: ${error.message}`);
  }

  await supabase.auth.admin.signOut(affiliate.profile.id, "global");

  await prisma.profile.update({
    where: { id: affiliate.profile.id },
    data: { portalDisabledAt: new Date() },
  });

  await logAdminAction({
    adminId,
    action: "PORTAL_DISABLE",
    affiliateId,
    metadata: { profileId: affiliate.profile.id },
  });

  return { email: affiliate.profile.email };
}

export async function enableAffiliatePortalAccess(
  affiliateId: string,
  adminId: string
): Promise<{ email: string }> {
  const affiliate = await getAffiliateWithProfile(affiliateId);

  if (!affiliate.profile) {
    throw new Error("Affiliate does not have portal access");
  }

  assertWritableAuth();

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(
    affiliate.profile.id,
    { ban_duration: "none" }
  );

  if (error) {
    throw new Error(`Failed to enable login: ${error.message}`);
  }

  await prisma.profile.update({
    where: { id: affiliate.profile.id },
    data: { portalDisabledAt: null },
  });

  await logAdminAction({
    adminId,
    action: "PORTAL_ENABLE",
    affiliateId,
    metadata: { profileId: affiliate.profile.id },
  });

  return { email: affiliate.profile.email };
}

export async function forceAffiliateSignOut(
  affiliateId: string,
  adminId: string
): Promise<{ email: string }> {
  const affiliate = await getAffiliateWithProfile(affiliateId);

  if (!affiliate.profile) {
    throw new Error("Affiliate does not have portal access");
  }

  assertWritableAuth();

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.signOut(
    affiliate.profile.id,
    "global"
  );

  if (error) {
    throw new Error(`Failed to sign out affiliate: ${error.message}`);
  }

  await logAdminAction({
    adminId,
    action: "PORTAL_FORCE_SIGN_OUT",
    affiliateId,
    metadata: { profileId: affiliate.profile.id },
  });

  return { email: affiliate.profile.email };
}

export async function touchAffiliateLastSignIn(userId: string) {
  await prisma.profile.updateMany({
    where: { id: userId },
    data: { lastSignInAt: new Date() },
  });
}
