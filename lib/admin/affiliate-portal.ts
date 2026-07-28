import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkProfileToAffiliateByEmail } from "@/lib/sync";
import { logAdminAction } from "./audit-log";

function randomPassword(length = 16): string {
  const chars =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export type InviteAffiliateResult = {
  created: boolean;
  linked: boolean;
  email: string;
  temporaryPassword?: string;
  profileId: string;
  inviteMessage?: string;
};

export type PortalActionResult = {
  email: string;
  temporaryPassword?: string;
  inviteMessage?: string;
};

function portalLoginUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${base}/login`;
}

export function buildPortalInviteMessage(input: {
  name: string;
  email: string;
  temporaryPassword: string;
}): string {
  return [
    `Hi ${input.name},`,
    "",
    "Your True Sciences affiliate portal is ready.",
    "",
    `Login: ${portalLoginUrl()}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Please sign in and change your password when prompted.",
  ].join("\n");
}

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

async function setAuthPassword(
  userId: string,
  password: string,
  displayName: string
) {
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    app_metadata: { role: Role.AFFILIATE },
    user_metadata: { name: displayName },
    ban_duration: "none",
  });

  if (error) {
    throw new Error(`Failed to update login: ${error.message}`);
  }
}

export async function inviteAffiliateToPortal(
  affiliateId: string,
  adminId?: string
): Promise<InviteAffiliateResult> {
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

  const temporaryPassword = randomPassword();
  const existingAuthId = await findAuthUserIdByEmail(email);
  let userId = existingAuthId;

  if (existingAuthId) {
    await setAuthPassword(existingAuthId, temporaryPassword, displayName);
  } else {
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { role: Role.AFFILIATE },
      user_metadata: { name: displayName },
    });

    if (error) {
      throw new Error(`Failed to create login: ${error.message}`);
    }

    userId = data.user.id;
  }

  if (!userId) {
    throw new Error("Failed to resolve portal user");
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

  const inviteMessage = buildPortalInviteMessage({
    name: displayName,
    email,
    temporaryPassword,
  });

  if (adminId) {
    await logAdminAction({
      adminId,
      action: existingAuthId ? "PORTAL_RESET_PASSWORD" : "PORTAL_CREATE",
      affiliateId,
      metadata: { profileId: userId },
    });
  }

  return {
    created: !existingAuthId,
    linked: true,
    email,
    temporaryPassword,
    profileId: userId,
    inviteMessage,
  };
}

export async function resetAffiliatePortalPassword(
  affiliateId: string,
  adminId: string
): Promise<PortalActionResult> {
  const affiliate = await getAffiliateWithProfile(affiliateId);

  if (!affiliate.profile) {
    throw new Error("Affiliate does not have portal access");
  }

  const temporaryPassword = randomPassword();
  const displayName =
    affiliate.displayName ?? affiliate.profile.name ?? affiliate.email;

  await setAuthPassword(
    affiliate.profile.id,
    temporaryPassword,
    displayName
  );

  await prisma.profile.update({
    where: { id: affiliate.profile.id },
    data: {
      mustChangePassword: true,
      portalDisabledAt: null,
    },
  });

  const inviteMessage = buildPortalInviteMessage({
    name: displayName,
    email: affiliate.profile.email,
    temporaryPassword,
  });

  await logAdminAction({
    adminId,
    action: "PORTAL_RESET_PASSWORD",
    affiliateId,
    metadata: { profileId: affiliate.profile.id },
  });

  return {
    email: affiliate.profile.email,
    temporaryPassword,
    inviteMessage,
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
