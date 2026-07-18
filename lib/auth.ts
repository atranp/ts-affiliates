import { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "./prisma";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  affiliateId: string | null;
  affiliateName: string | null;
};

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

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    affiliateId: profile.affiliateId,
    affiliateName:
      profile.affiliate?.displayName ?? profile.affiliate?.email ?? null,
  };
}

export function isAdmin(role: Role) {
  return role === Role.ADMIN;
}
