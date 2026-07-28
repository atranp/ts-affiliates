import { AffiliateStatus, Role } from "@prisma/client";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATE_COOKIE } from "@/lib/auth-impersonation";
import { prisma } from "./prisma";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  affiliateId: string | null;
  affiliateName: string | null;
  mustChangePassword?: boolean;
  impersonating?: boolean;
  realUserId?: string;
  realUserName?: string;
};

export type AuthBlockReason =
  | "NO_PROFILE"
  | "PORTAL_DISABLED"
  | "AFFILIATE_INACTIVE";

export async function getAuthBlockReason(
  userId: string
): Promise<AuthBlockReason | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    include: { affiliate: true },
  });

  if (!profile) return "NO_PROFILE";
  if (profile.role !== Role.AFFILIATE) return null;
  if (profile.portalDisabledAt) return "PORTAL_DISABLED";
  if (profile.affiliate?.status !== AffiliateStatus.ACTIVE) {
    return "AFFILIATE_INACTIVE";
  }
  return null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    include: { affiliate: true },
  });

  if (!profile) return null;

  const cookieStore = await cookies();
  const impersonateAffiliateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;

  if (profile.role === Role.ADMIN && impersonateAffiliateId) {
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: impersonateAffiliateId },
    });

    if (affiliate) {
      return {
        id: profile.id,
        email: profile.email,
        name: affiliate.displayName ?? affiliate.email,
        role: Role.AFFILIATE,
        affiliateId: affiliate.id,
        affiliateName: affiliate.displayName ?? affiliate.email,
        impersonating: true,
        realUserId: profile.id,
        realUserName: profile.name,
        mustChangePassword: false,
      };
    }
  }

  if (profile.role === Role.AFFILIATE) {
    const blockReason = await getAuthBlockReason(user.id);
    if (blockReason) return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    affiliateId: profile.affiliateId,
    affiliateName:
      profile.affiliate?.displayName ?? profile.affiliate?.email ?? null,
    mustChangePassword: profile.mustChangePassword,
  };
}

export async function getRealAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    include: { affiliate: true },
  });

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    affiliateId: profile.affiliateId,
    affiliateName:
      profile.affiliate?.displayName ?? profile.affiliate?.email ?? null,
    mustChangePassword: profile.mustChangePassword,
  };
}

export function isAdmin(role: Role) {
  return role === Role.ADMIN;
}
