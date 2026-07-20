import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkProfileToAffiliateByEmail } from "@/lib/sync";

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
};

export async function inviteAffiliateToPortal(
  affiliateId: string
): Promise<InviteAffiliateResult> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: { profile: true },
  });

  if (!affiliate) {
    throw new Error("Affiliate not found");
  }

  const email = affiliate.email.toLowerCase();

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
      data: { affiliateId },
    });

    return {
      created: false,
      linked: true,
      email: existingProfile.email,
      profileId: existingProfile.id,
    };
  }

  const supabase = createAdminClient();
  const temporaryPassword = randomPassword();
  const displayName =
    affiliate.displayName ?? email.split("@")[0] ?? "Affiliate";

  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingAuth = existingUsers.users.find(
    (user) => user.email?.toLowerCase() === email
  );

  let userId = existingAuth?.id;

  if (existingAuth) {
    await supabase.auth.admin.updateUserById(existingAuth.id, {
      app_metadata: { role: Role.AFFILIATE },
      user_metadata: { name: displayName },
    });
  } else {
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
    },
    create: {
      id: userId,
      email,
      name: displayName,
      role: Role.AFFILIATE,
      affiliateId,
    },
  });

  await linkProfileToAffiliateByEmail(userId, email);

  return {
    created: !existingAuth,
    linked: true,
    email,
    temporaryPassword: existingAuth ? undefined : temporaryPassword,
    profileId: userId,
  };
}
